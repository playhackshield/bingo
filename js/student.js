let currentSession = null;
let currentPlayer = null;
let currentSpin = null;
let bingoCard = [];
let gridSize = 0;
let allQuestions = [];
let correctStreak = 0;
let jokers = 0;

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  const res = await fetch('data/vragen.json');
  allQuestions = await res.json();
  
  document.getElementById('joinBtn').onclick = joinSession;
  document.getElementById('submitAnswerBtn').onclick = submitAnswer;
  document.getElementById('bingoBtn').onclick = claimBingo;
  document.getElementById('logout').onclick = () => auth.signOut().then(() => location.reload());
});

async function joinSession() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('sessionCodeInput').value.trim();
  
  if (!name || !code) {
    document.getElementById('joinError').innerText = 'Vul naam en code in.';
    return;
  }
  
  const snapshot = await bingoSessions.where('code', '==', code).where('active', '==', true).limit(1).get();
  if (snapshot.empty) {
    document.getElementById('joinError').innerText = 'Geen actieve sessie met deze code.';
    return;
  }
  
  const sessionDoc = snapshot.docs[0];
  currentSession = { id: sessionDoc.id, ...sessionDoc.data() };
  
  // Bereken grid dimensie
  const totalVakjes = currentSession.gridSize;
  const dimension = Math.sqrt(totalVakjes);
  gridSize = dimension;
  console.log(`Grid: ${gridSize}x${gridSize}`);

  // Genereer bingokaart
  const totalCells = gridSize * gridSize;
  let allIcons = [];
  allQuestions.forEach(q => {
    q.iconen.forEach(icon => {
      allIcons.push({ icon, thema: q.thema });
    });
  });
  
  const card = [];
  for (let i = 0; i < totalCells; i++) {
    const randomItem = allIcons[Math.floor(Math.random() * allIcons.length)];
    card.push({
      icon: randomItem.icon,
      thema: randomItem.thema,
      streaked: false
    });
  }

  // Sla speler op
  const playerData = {
    sessionId: currentSession.id,
    name: name,
    card: card,
    correctCount: 0,
    jokers: 0,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const playerRef = await bingoPlayers.add(playerData);
  currentPlayer = { id: playerRef.id, ...playerData };
  jokers = 0;
  correctStreak = 0;

  // Toon spel scherm
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'block';
  document.getElementById('sessionCodeDisplay').innerText = code;
  document.getElementById('playerNameDisplay').innerText = name;
  updateJokerDisplay();
  bingoCard = card;
  renderBingoCard();

  // 🔥 BELANGRIJK: Luister naar sessie updates (voor nieuwe vragen)
  bingoSessions.doc(currentSession.id).onSnapshot((doc) => {
    const data = doc.data();
    console.log("Sessie update ontvangen:", data);
    
    if (data.currentSpin && data.currentSpin.icon) {
      // Nieuwe vraag ontvangen!
      currentSpin = data.currentSpin;
      showStudentQuestion(data.currentSpin);
    } else {
      // Geen actieve vraag, verberg vraag gebied
      document.getElementById('studentQuestionArea').style.display = 'none';
    }
  });

  // Luister naar eigen player updates (voor jokers en kaart)
  bingoPlayers.doc(currentPlayer.id).onSnapshot((doc) => {
    if (doc.exists) {
      const updated = doc.data();
      currentPlayer.correctCount = updated.correctCount;
      jokers = updated.jokers || 0;
      updateJokerDisplay();
      if (updated.card) {
        bingoCard = updated.card;
        renderBingoCard();
      }
    }
  });
}

function showStudentQuestion(spin) {
  console.log("Toon vraag voor student:", spin.thema);
  
  document.getElementById('studentQuestionArea').style.display = 'block';
  document.getElementById('studentQuestionText').innerHTML = `
    <span style="font-size:2rem;">${spin.icon}</span><br>
    <strong>${spin.thema}</strong><br><br>
    ${spin.vraag}
  `;
  
  const optionsDiv = document.getElementById('studentOptions');
  optionsDiv.innerHTML = '';
  spin.opties.forEach((opt, idx) => {
    const btn = document.createElement('div');
    btn.classList.add('option');
    btn.innerText = opt;
    btn.dataset.idx = idx;
    btn.onclick = () => {
      document.querySelectorAll('#studentOptions .option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
    };
    optionsDiv.appendChild(btn);
  });
  
  document.getElementById('submitAnswerBtn').disabled = false;
  document.getElementById('answerFeedback').innerHTML = '';
}

async function submitAnswer() {
  if (!currentSpin) {
    document.getElementById('answerFeedback').innerHTML = '<span style="color:#ffcdd2;">Er is geen actieve vraag.</span>';
    return;
  }
  
  const selected = document.querySelector('#studentOptions .option.selected');
  if (!selected) {
    document.getElementById('answerFeedback').innerHTML = '<span style="color:#ffcdd2;">Kies een antwoord.</span>';
    return;
  }
  
  const answerIndex = parseInt(selected.dataset.idx);
  const isCorrect = (answerIndex === currentSpin.correct);
  
  if (isCorrect) {
    correctStreak++;
    let newJokers = jokers;
    
    if (correctStreak === 3) {
      newJokers++;
      correctStreak = 0;
      document.getElementById('answerFeedback').innerHTML = '<span style="color:#a5d6a7;">🎉 Goed! Je hebt een JOKER verdiend!</span>';
    } else {
      document.getElementById('answerFeedback').innerHTML = '<span style="color:#a5d6a7;">✅ Goed antwoord!</span>';
    }
    
    // Update jokers in Firebase
    await bingoPlayers.doc(currentPlayer.id).update({
      jokers: newJokers
    });
    jokers = newJokers;
    updateJokerDisplay();
    
  } else {
    correctStreak = 0;
    document.getElementById('answerFeedback').innerHTML = `<span style="color:#ffcdd2;">❌ Fout! Het juiste antwoord is: ${currentSpin.opties[currentSpin.correct]}</span>`;
  }
  
  document.getElementById('submitAnswerBtn').disabled = true;
}

function updateJokerDisplay() {
  const display = document.getElementById('jokerCount');
  if (display) {
    display.innerText = jokers;
  }
}

function renderBingoCard() {
  const container = document.getElementById('bingoCard');
  if (!container) return;
  
  container.style.display = 'grid';
  container.style.gap = '10px';
  container.style.justifyContent = 'center';
  container.style.gridTemplateColumns = `repeat(${gridSize}, minmax(80px, 100px))`;
  container.innerHTML = '';
  
  bingoCard.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = `bingo-cell ${cell.streaked ? 'streaked' : ''}`;
    div.innerHTML = cell.icon;
    
    div.onclick = () => {
      bingoCard[idx].streaked = !cell.streaked;
      renderBingoCard();
      bingoPlayers.doc(currentPlayer.id).update({ card: bingoCard }).catch(console.error);
    };
    
    container.appendChild(div);
  });
}

async function claimBingo() {
  if (!currentSession || !currentPlayer) {
    alert("Nog niet verbonden met een sessie.");
    return;
  }
  
  const result = checkBingoWithJokers();
  
  if (!result.isBingo) {
    alert(`Geen bingo! Je mist ${result.missingCount} vakje(s). Je hebt ${jokers} joker(s).`);
    return;
  }
  
  await bingoClaims.add({
    sessionId: currentSession.id,
    playerId: currentPlayer.id,
    name: currentPlayer.name,
    jokersUsed: result.jokersUsed,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  
  alert(`🎉 BINGO! Gefeliciteerd!\nGebruikte jokers: ${result.jokersUsed}`);
}

function checkBingoWithJokers() {
  const size = gridSize;
  let grid = [];
  for (let i = 0; i < size; i++) {
    grid.push(bingoCard.slice(i * size, (i + 1) * size));
  }
  
  let bestMissing = 999;
  let bestJokersUsed = 0;
  
  // Check rijen
  for (let r = 0; r < size; r++) {
    const missing = grid[r].filter(cell => !cell.streaked).length;
    if (missing <= jokers && missing < bestMissing) {
      bestMissing = missing;
      bestJokersUsed = missing;
    }
  }
  
  // Check kolommen
  for (let c = 0; c < size; c++) {
    let missing = 0;
    for (let r = 0; r < size; r++) {
      if (!grid[r][c].streaked) missing++;
    }
    if (missing <= jokers && missing < bestMissing) {
      bestMissing = missing;
      bestJokersUsed = missing;
    }
  }
  
  // Diagonaal 1
  let missing1 = 0;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].streaked) missing1++;
  }
  if (missing1 <= jokers && missing1 < bestMissing) {
    bestMissing = missing1;
    bestJokersUsed = missing1;
  }
  
  // Diagonaal 2
  let missing2 = 0;
  for (let i = 0; i < size; i++) {
    if (!grid[i][size - 1 - i].streaked) missing2++;
  }
  if (missing2 <= jokers && missing2 < bestMissing) {
    bestMissing = missing2;
    bestJokersUsed = missing2;
  }
  
  return {
    isBingo: bestMissing <= jokers,
    missingCount: bestMissing,
    jokersUsed: bestJokersUsed
  };
}

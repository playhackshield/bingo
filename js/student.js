let currentSession = null;
let currentPlayer = null;
let currentSpin = null;
let bingoCard = [];
let gridSize = 0;
let allQuestions = [];

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  // Laad vragenlijst voor iconen
  const res = await fetch('data/vragen.json');
  allQuestions = await res.json();
  // Join
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
  gridSize = currentSession.gridSize;
  console.log("Opgehaalde gridSize:", gridSize, "Type:", typeof gridSize);
  
  // --- Genereer exact het aantal benodigde vakjes ---
  const totalCells = gridSize * gridSize;
  // Verzamel alle beschikbare iconen
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
  console.log(`Aantal gegenereerde vakjes: ${card.length}`); // Moet gelijk zijn aan totalCells

  const playerData = {
    sessionId: currentSession.id,
    name: name,
    card: card,
    correctCount: 0,
    bonusAvailable: false,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const playerRef = await bingoPlayers.add(playerData);
  currentPlayer = { id: playerRef.id, ...playerData };

  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'block';
  document.getElementById('sessionCodeDisplay').innerText = code;
  document.getElementById('playerNameDisplay').innerText = name;
  bingoCard = card;
  renderBingoCard();
  
  // Luister naar sessie-updates (nieuwe spin)
  bingoSessions.doc(currentSession.id).onSnapshot(async (doc) => {
    const data = doc.data();
    if (data.currentSpin && data.currentSpin.icon) {
      currentSpin = data.currentSpin;
      // Toon vraag aan leerling
      showStudentQuestion(data.currentSpin);
    } else {
      // Geen actieve spin, verberg vraag area
      document.getElementById('studentQuestionArea').style.display = 'none';
    }
    // Als antwoord onthuld is, geef feedback en update bonus
    if (data.currentAnswerRevealed && currentSpin) {
      await handleAnswerFeedback(data.correctAnswer);
    }
  });

  // Luister naar eigen player updates (voor bonus)
  bingoPlayers.doc(currentPlayer.id).onSnapshot((doc) => {
    if (doc.exists) {
      const updated = doc.data();
      currentPlayer.correctCount = updated.correctCount;
      document.getElementById('correctCount').innerText = updated.correctCount;
      if (updated.card) {
        // Update kaart (streepjes)
        bingoCard = updated.card;
        renderBingoCard();
      }
    }
  });
}

function renderBingoCard() {
  const container = document.getElementById('bingoCard');
  if (!container) return;

  // Forceer een grid lay-out met het juiste aantal kolommen
  container.style.display = 'grid';
  container.style.gap = '10px';
  container.style.justifyContent = 'center';
  container.style.gridTemplateColumns = `repeat(${gridSize}, minmax(80px, 100px))`;
  
  container.innerHTML = '';
  console.log(`Rendering ${bingoCard.length} vakjes in een ${gridSize}x${gridSize} grid`);

  bingoCard.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = `bingo-cell ${cell.streaked ? 'streaked' : ''}`;
    div.innerHTML = cell.icon;
    div.onclick = () => {
      if (currentSpin && !cell.streaked && currentSpin.icon === cell.icon) {
        streakCell(idx);
      } else if (currentPlayer && currentPlayer.bonusAvailable && !cell.streaked) {
        streakCell(idx);
      } else {
        alert('Je mag dit vakje nu niet wegstrepen.');
      }
    };
    container.appendChild(div);
  });
}

async function streakCell(index) {
  const newCard = [...bingoCard];
  if (newCard[index].streaked) return;
  newCard[index].streaked = true;
  await bingoPlayers.doc(currentPlayer.id).update({ card: newCard });
  // Als we een bonus hebben gebruikt, reset bonus
  if (currentPlayer.bonusAvailable) {
    await bingoPlayers.doc(currentPlayer.id).update({ bonusAvailable: false });
  }
  // Na strepen, clear currentSpin zodat leerling niet nogmaals kan strepen
  // (maar de leraar moet volgende ronde starten)
}

function showStudentQuestion(spin) {
  document.getElementById('studentQuestionArea').style.display = 'block';
  document.getElementById('studentQuestionText').innerHTML = `<span style="font-size:2rem;">${spin.icon}</span> ${spin.thema}<br>${spin.vraag}`;
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
}

async function submitAnswer() {
  const selected = document.querySelector('#studentOptions .option.selected');
  if (!selected) {
    alert('Kies een antwoord.');
    return;
  }
  const answerIndex = parseInt(selected.dataset.idx);
  const isCorrect = (answerIndex === currentSpin.correct);
  // Stuur antwoord naar de leraar? We hoeven het niet op te slaan, alleen lokaal bepalen we of we bonus krijgen.
  // Maar we moeten wel de correctCount updaten.
  let newCorrectCount = currentPlayer.correctCount;
  let bonus = currentPlayer.bonusAvailable;
  if (isCorrect) {
    newCorrectCount++;
    if (newCorrectCount === 3) {
      bonus = true;
      newCorrectCount = 0;
      alert('🎉 Je hebt 3 vragen goed! Je mag een extra vakje wegstrepen (bonus).');
    }
  } else {
    // Fout: geen bonus, correctCount reset? Volgens spelregels alleen bonus bij 3 goed, fout telt niet mee.
    // Blijft correctCount zoals hij was.
  }
  await bingoPlayers.doc(currentPlayer.id).update({
    correctCount: newCorrectCount,
    bonusAvailable: bonus
  });
  // Sluit vraag area tot volgende spin
  document.getElementById('studentQuestionArea').style.display = 'none';
  // Optioneel: toon feedback of het antwoord goed was
  if (isCorrect) {
    alert('Goed antwoord! Je mag nu het juiste icoon wegstrepen (als je het hebt).');
  } else {
    alert('Fout antwoord! Je mag deze ronde geen vakje wegstrepen.');
  }
}

async function handleAnswerFeedback(correctIndex) {
  // Wordt aangeroepen nadat leraar "Volgende" heeft geklikt
  // We kunnen hier de opties highlighten en de speler laten zien of hij goed had.
  // Omdat we al feedback gaven bij submitAnswer, is dit niet nodig.
  // Maar we kunnen wel de vraag area sluiten.
  document.getElementById('studentQuestionArea').style.display = 'none';
}

async function claimBingo() {
  // Check of speler daadwerkelijk een bingo heeft (horizontaal, verticaal, diagonaal)
  const hasBingo = checkBingo();
  if (!hasBingo) {
    alert('Je hebt nog geen bingo! Streep eerst een volledige rij, kolom of diagonaal.');
    return;
  }
  // Claim registreren
  await bingoClaims.add({
    sessionId: currentSession.id,
    playerId: currentPlayer.id,
    name: currentPlayer.name,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  });
  alert('Bingo geclaimd! Je naam verschijnt op het digibord.');
}

function checkBingo() {
  // Maak grid van bingoCard (gridSize x gridSize)
  const size = gridSize;
  let grid = [];
  for (let i = 0; i < size; i++) {
    grid.push(bingoCard.slice(i * size, (i + 1) * size));
  }
  // Controleer rijen
  for (let r = 0; r < size; r++) {
    if (grid[r].every(cell => cell.streaked)) return true;
  }
  // Kolommen
  for (let c = 0; c < size; c++) {
    let colFull = true;
    for (let r = 0; r < size; r++) {
      if (!grid[r][c].streaked) colFull = false;
    }
    if (colFull) return true;
  }
  // Diagonaal hoofddiagonaal
  let diag1 = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].streaked) diag1 = false;
  }
  if (diag1) return true;
  // Diagonaal tegenovergesteld
  let diag2 = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][size - 1 - i].streaked) diag2 = false;
  }
  return diag2;
}

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
  
  try {
    const res = await fetch('data/vragen.json');
    allQuestions = await res.json();
    console.log("Vragen geladen:", allQuestions.length);
  } catch (error) {
    console.error("Fout bij laden vragen:", error);
  }
  
  // Event listeners
  const joinBtn = document.getElementById('joinBtn');
  const bingoBtn = document.getElementById('bingoBtn');
  const logoutBtn = document.getElementById('logout');
  const submitAnswerBtn = document.getElementById('submitAnswerBtn');
  
  if (joinBtn) joinBtn.onclick = joinSession;
  if (bingoBtn) bingoBtn.onclick = claimBingo;
  if (submitAnswerBtn) submitAnswerBtn.onclick = submitAnswer;
  
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearLocalStorage();
      auth.signOut().then(() => location.reload());
    };
  }
  
  // 🔥 Probeer bestaande sessie te hervatten
  const resumed = await tryResumeSession();
  if (!resumed) {
    // Geen bestaande sessie, toon join scherm
    document.getElementById('joinScreen').style.display = 'block';
    document.getElementById('gameScreen').style.display = 'none';
  }
});

// Auto-hervat functie
async function tryResumeSession() {
  const savedStudentId = localStorage.getItem('hackshield_studentId');
  const savedSessionId = localStorage.getItem('hackshield_sessionId');
  
  if (!savedStudentId || !savedSessionId) return false;
  
  try {
    // Haal student data op
    const studentDoc = await bingoPlayers.doc(savedStudentId).get();
    if (!studentDoc.exists) return false;
    
    const studentData = studentDoc.data();
    
    // Controleer of de sessie nog actief is
    const sessionDoc = await bingoSessions.doc(savedSessionId).get();
    if (!sessionDoc.exists || !sessionDoc.data().active) return false;
    
    // Herstel data
    currentSession = { id: savedSessionId, ...sessionDoc.data() };
    currentPlayer = { id: savedStudentId, ...studentData };
    bingoCard = studentData.card || [];
    jokers = studentData.jokers || 0;
    correctStreak = 0;
    
    // Herstel gridSize
    const totalVakjes = currentSession.gridSize;
    const dimension = Math.sqrt(totalVakjes);
    gridSize = dimension;
    
    // Toon spel scherm
    document.getElementById('joinScreen').style.display = 'none';
    document.getElementById('gameScreen').style.display = 'block';
    document.getElementById('sessionCodeDisplay').innerText = currentSession.code;
    document.getElementById('playerNameDisplay').innerText = currentPlayer.name;
    
    updateJokerDisplay();
    renderBingoCard();
    
    // Luister naar sessie updates (voor vragen)
    bingoSessions.doc(currentSession.id).onSnapshot((doc) => {
      const data = doc.data();
      if (data && data.currentSpin && data.currentSpin.icon) {
        currentSpin = data.currentSpin;
        showStudentQuestion(data.currentSpin);
      } else {
        const questionArea = document.getElementById('studentQuestionArea');
        if (questionArea) questionArea.style.display = 'none';
      }
    });
    
    // Luister naar eigen player updates
    bingoPlayers.doc(currentPlayer.id).onSnapshot((doc) => {
      if (doc && doc.exists) {
        const updated = doc.data();
        if (updated) {
          currentPlayer.correctCount = updated.correctCount;
          jokers = updated.jokers || 0;
          updateJokerDisplay();
          if (updated.card) {
            bingoCard = updated.card;
            renderBingoCard();
          }
        }
      }
    });
    
    return true;
    
  } catch (error) {
    console.error("Fout bij hervatten sessie:", error);
    return false;
  }
}

async function joinSession() {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('sessionCodeInput').value.trim();
  
  if (!name || !code) {
    const errorDiv = document.getElementById('joinError');
    if (errorDiv) errorDiv.innerText = 'Vul naam en code in.';
    return;
  }
  
  try {
    const snapshot = await bingoSessions.where('code', '==', code).where('active', '==', true).limit(1).get();
    if (snapshot.empty) {
      const errorDiv = document.getElementById('joinError');
      if (errorDiv) errorDiv.innerText = 'Geen actieve sessie met deze code.';
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
    if (allQuestions.length > 0) {
      allQuestions.forEach(q => {
        q.iconen.forEach(icon => {
          allIcons.push({ icon, thema: q.thema });
        });
      });
    } else {
      // Fallback iconen als vragen niet laden
      allIcons = [
        { icon: "🔒", thema: "Veiligheid" },
        { icon: "📧", thema: "Phishing" },
        { icon: "🔐", thema: "Wachtwoord" }
      ];
    }
    
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

    // Sla studentId en sessionId op in localStorage voor hervatting
    localStorage.setItem('hackshield_studentId', playerRef.id);
    localStorage.setItem('hackshield_sessionId', currentSession.id);
    
    // Toon spel scherm
    const joinScreen = document.getElementById('joinScreen');
    const gameScreen = document.getElementById('gameScreen');
    const sessionCodeDisplay = document.getElementById('sessionCodeDisplay');
    const playerNameDisplay = document.getElementById('playerNameDisplay');
    
    if (joinScreen) joinScreen.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'block';
    if (sessionCodeDisplay) sessionCodeDisplay.innerText = code;
    if (playerNameDisplay) playerNameDisplay.innerText = name;
  
    updateJokerDisplay();
    bingoCard = card;
    renderBingoCard();

    // Luister naar sessie updates (voor nieuwe vragen)
    bingoSessions.doc(currentSession.id).onSnapshot((doc) => {
      const data = doc.data();
      console.log("Sessie update ontvangen:", data);
      
      if (data && data.currentSpin && data.currentSpin.icon) {
        currentSpin = data.currentSpin;
        showStudentQuestion(data.currentSpin);
      } else {
        const questionArea = document.getElementById('studentQuestionArea');
        if (questionArea) questionArea.style.display = 'none';
      }
    });

    // Luister naar eigen player updates
    bingoPlayers.doc(currentPlayer.id).onSnapshot((doc) => {
      if (doc && doc.exists) {
        const updated = doc.data();
        if (updated) {
          currentPlayer.correctCount = updated.correctCount;
          jokers = updated.jokers || 0;
          updateJokerDisplay();
          if (updated.card) {
            bingoCard = updated.card;
            renderBingoCard();
          }
        }
      }
    });
    
  } catch (error) {
    console.error("Fout bij joinen:", error);
    const errorDiv = document.getElementById('joinError');
    if (errorDiv) errorDiv.innerText = 'Fout bij deelnemen: ' + error.message;
  }
}

function clearLocalStorage() {
  localStorage.removeItem('hackshield_studentId');
  localStorage.removeItem('hackshield_sessionId');
}

function showStudentQuestion(spin) {
  console.log("Toon vraag voor student:", spin.thema);
  
  const questionArea = document.getElementById('studentQuestionArea');
  const questionIcon = document.getElementById('studentQuestionIcon');
  const questionThema = document.getElementById('studentQuestionThema');
  const questionText = document.getElementById('studentQuestionText');
  const optionsDiv = document.getElementById('studentOptions');
  const submitBtn = document.getElementById('submitAnswerBtn');
  const feedbackDiv = document.getElementById('answerFeedback');
  
  if (!questionArea || !questionText || !optionsDiv) {
    console.error("Vraag elementen niet gevonden!");
    return;
  }
  
  questionArea.style.display = 'block';
  
  // Icoon en thema apart tonen
  if (questionIcon) questionIcon.innerHTML = spin.icon;
  if (questionThema) questionThema.innerHTML = spin.thema;
  questionText.innerHTML = spin.vraag;
  
  optionsDiv.innerHTML = '';
  if (spin.opties && Array.isArray(spin.opties)) {
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
  }
  
  if (submitBtn) submitBtn.disabled = false;
  if (feedbackDiv) feedbackDiv.innerHTML = '';
}

async function submitAnswer() {
  if (!currentSpin) {
    const feedbackDiv = document.getElementById('answerFeedback');
    if (feedbackDiv) feedbackDiv.innerHTML = '<span style="color:#ffcdd2;">Er is geen actieve vraag.</span>';
    return;
  }
  
  const selected = document.querySelector('#studentOptions .option.selected');
  if (!selected) {
    const feedbackDiv = document.getElementById('answerFeedback');
    if (feedbackDiv) feedbackDiv.innerHTML = '<span style="color:#ffcdd2;">Kies een antwoord.</span>';
    return;
  }
  
  const answerIndex = parseInt(selected.dataset.idx);
  const isCorrect = (answerIndex === currentSpin.correct);
  const feedbackDiv = document.getElementById('answerFeedback');
  
  if (isCorrect) {
    correctStreak++;
    let newJokers = jokers;
    
    if (correctStreak === 3) {
      newJokers++;
      correctStreak = 0;
      if (feedbackDiv) feedbackDiv.innerHTML = '<span style="color:#a5d6a7;">🎉 Goed! Je hebt een JOKER verdiend!</span>';
    } else {
      if (feedbackDiv) feedbackDiv.innerHTML = '<span style="color:#a5d6a7;">✅ Goed antwoord!</span>';
    }
    
    // Update jokers in Firebase
    if (currentPlayer && currentPlayer.id) {
      await bingoPlayers.doc(currentPlayer.id).update({
        jokers: newJokers
      });
      jokers = newJokers;
      updateJokerDisplay();
    }
    
  } else {
    correctStreak = 0;
    if (feedbackDiv && currentSpin.opties) {
      feedbackDiv.innerHTML = `<span style="color:#ffcdd2;">❌ Fout! Het juiste antwoord is: ${currentSpin.opties[currentSpin.correct]}</span>`;
    }
  }
  
  const submitBtn = document.getElementById('submitAnswerBtn');
  if (submitBtn) submitBtn.disabled = true;
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
  
  if (!bingoCard || bingoCard.length === 0) return;
  
  bingoCard.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = `bingo-cell ${cell.streaked ? 'streaked' : ''}`;
    div.innerHTML = cell.icon;
    
    div.onclick = () => {
      if (bingoCard && bingoCard[idx]) {
        bingoCard[idx].streaked = !cell.streaked;
        renderBingoCard();
        if (currentPlayer && currentPlayer.id) {
          bingoPlayers.doc(currentPlayer.id).update({ card: bingoCard }).catch(console.error);
        }
      }
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
  
  try {
    await bingoClaims.add({
      sessionId: currentSession.id,
      playerId: currentPlayer.id,
      name: currentPlayer.name,
      jokersUsed: result.jokersUsed,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    alert(`🎉 BINGO! Gefeliciteerd!\nGebruikte jokers: ${result.jokersUsed}`);
  } catch (error) {
    console.error("Fout bij claimen:", error);
    alert("Fout bij claimen: " + error.message);
  }
}

function checkBingoWithJokers() {
  if (!bingoCard || bingoCard.length === 0 || gridSize === 0) {
    return { isBingo: false, missingCount: 999, jokersUsed: 0 };
  }
  
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

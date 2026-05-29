let currentSessionId = null;
let currentQuestion = null;
let currentIcon = null;
let currentThema = null;
let currentQuestionIndex = 0;
let questionsHistory = [];

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('sessionId');
  
  if (sessionIdFromUrl) {
    currentSessionId = sessionIdFromUrl;
    await loadExistingSession(sessionIdFromUrl);
  } else {
    document.getElementById('setupScreen').style.display = 'block';
    document.getElementById('activeSession').style.display = 'none';
  }
  
  // Event listeners
  document.getElementById('createSessionBtn').onclick = createSession;
  document.getElementById('spinBtn').onclick = spinWheel;
  document.getElementById('prevQuestionBtn').onclick = previousQuestion;
  document.getElementById('nextQuestionBtn').onclick = nextQuestion;
  document.getElementById('endSessionBtn').onclick = endSession;
});

async function createSession() {
  const gridSize = parseInt(document.getElementById('gridSize').value);
  const code = generateSessionCode();
  
  const sessionData = {
    code: code,
    gridSize: gridSize,
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    currentSpin: null,
    currentQuestion: null,
    currentIcon: null,
    currentAnswerRevealed: false,
    correctAnswer: null,
    questionsHistory: []
  };
  
  try {
    const docRef = await bingoSessions.add(sessionData);
    currentSessionId = docRef.id;
    
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('activeSession').style.display = 'block';
    document.getElementById('sessionCode').innerText = code;
    
    loadPlayers();
    loadClaims();
    
    bingoSessions.doc(currentSessionId).onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data.currentSpin && data.currentSpin.icon) {
          showCurrentQuestion(data.currentSpin);
        }
      }
    });
    
  } catch (error) {
    console.error("Fout bij aanmaken sessie:", error);
    alert("Kon geen sessie aanmaken: " + error.message);
  }
}

async function loadExistingSession(sessionId) {
  try {
    const sessionDoc = await bingoSessions.doc(sessionId).get();
    if (!sessionDoc.exists) {
      alert("Sessie niet gevonden");
      window.location.href = 'sessions.html';
      return;
    }
    
    const sessionData = sessionDoc.data();
    currentSessionId = sessionId;
    questionsHistory = sessionData.questionsHistory || [];
    currentQuestionIndex = questionsHistory.length;
    
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('activeSession').style.display = 'block';
    document.getElementById('sessionCode').innerText = sessionData.code;
    
    updateQuestionCounter();
    
    loadPlayers();
    loadClaims();
    
    if (sessionData.currentSpin && sessionData.currentSpin.icon) {
      showCurrentQuestion(sessionData.currentSpin);
    }
    
    bingoSessions.doc(currentSessionId).onSnapshot((doc) => {
      if (doc.exists) {
        const data = doc.data();
        if (data.currentSpin && data.currentSpin.icon) {
          showCurrentQuestion(data.currentSpin);
        }
      }
    });

    updateHistoryDisplay();    
    
  } catch (error) {
    console.error("Fout bij laden sessie:", error);
    alert("Kon sessie niet laden: " + error.message);
    window.location.href = 'sessions.html';
  }
}

function updateQuestionCounter() {
  const counterDiv = document.getElementById('questionCounter');
  if (counterDiv && questionsHistory.length > 0) {
    counterDiv.innerHTML = `Vraag ${currentQuestionIndex} van ${questionsHistory.length}`;
  } else if (counterDiv) {
    counterDiv.innerHTML = 'Nog geen vragen gedraaid';
  }
}

async function loadPlayers() {
  bingoPlayers.where('sessionId', '==', currentSessionId).onSnapshot(snapshot => {
    document.getElementById('playerCount').innerText = snapshot.size;
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    snapshot.forEach(doc => {
      const p = doc.data();
      const li = document.createElement('li');
      li.innerText = `${p.name} (jokers: ${p.jokers || 0})`;
      list.appendChild(li);
    });
  });
}

// Functie om geschiedenis weer te geven
function updateHistoryDisplay() {
  const historyContainer = document.getElementById('historyList');
  if (!historyContainer) return;
  
  if (!questionsHistory || questionsHistory.length === 0) {
    historyContainer.innerHTML = '<div class="empty-history">Nog geen iconen getrokken</div>';
    return;
  }
  
  historyContainer.innerHTML = '';
  
  // Toon alle iconen in volgorde (meest recente eerst)
  const reversedHistory = [...questionsHistory].reverse();
  
  reversedHistory.forEach((item, idx) => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    const vraagNummer = questionsHistory.length - idx;
    historyItem.innerHTML = `
      <div class="history-number">#${vraagNummer}</div>
      <div class="history-icon">${item.icon}</div>
    `;
    historyItem.title = `${item.thema} - ${item.vraag.substring(0, 50)}...`;
    historyItem.onclick = () => {
      if (confirm(`Ga naar vraag ${vraagNummer}: ${item.thema}?`)) {
        jumpToQuestion(vraagNummer - 1);
      }
    };
    historyContainer.appendChild(historyItem);
  });
}

// Functie om naar een specifieke vraag te springen
async function jumpToQuestion(index) {
  if (index < 0 || index >= questionsHistory.length) return;
  
  const targetQuestion = questionsHistory[index];
  if (!targetQuestion) return;
  
  currentQuestionIndex = index + 1;
  currentIcon = targetQuestion.icon;
  currentThema = targetQuestion.thema;
  currentQuestion = {
    vraag: targetQuestion.vraag,
    opties: targetQuestion.opties,
    correct: targetQuestion.correct
  };
  
  await bingoSessions.doc(currentSessionId).update({
    currentSpin: {
      icon: currentIcon,
      thema: currentThema,
      vraag: currentQuestion.vraag,
      opties: currentQuestion.opties,
      correct: currentQuestion.correct
    },
    currentAnswerRevealed: false,
    correctAnswer: null
  });
  
  const wheel = document.getElementById('wheel');
  if (wheel) wheel.innerHTML = `<div class="wheel-icon" style="font-size: 6rem;">${currentIcon}</div>`;
  
  updateQuestionCounter();
  updateHistoryDisplay();
  showCurrentQuestion({
    icon: currentIcon,
    thema: currentThema,
    vraag: currentQuestion.vraag,
    opties: currentQuestion.opties
  });
}

async function loadClaims() {
  bingoClaims.where('sessionId', '==', currentSessionId).orderBy('timestamp', 'desc').onSnapshot(snapshot => {
    const list = document.getElementById('claimsList');
    list.innerHTML = '';
    snapshot.forEach(doc => {
      const claim = doc.data();
      const time = claim.timestamp?.toDate().toLocaleTimeString() || 'nu';
      const li = document.createElement('li');
      li.innerText = `${claim.name} riep BINGO! (jokers: ${claim.jokersUsed || 0}) om ${time}`;
      list.appendChild(li);
    });
  });
}

async function spinWheel() {
  const wheel = document.getElementById('wheel');
  if (!wheel) return;
  
  wheel.innerHTML = '<div class="wheel-countdown">?</div>';
  wheel.classList.add('spinning');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    const res = await fetch('data/vragen.json');
    const allQuestions = await res.json();
    
    let allIcons = [];
    allQuestions.forEach(q => {
      q.iconen.forEach(icon => {
        allIcons.push({ icon, thema: q.thema, vraag: q.vraag, opties: q.opties, correct: q.correct });
      });
    });
    
    const randomIndex = Math.floor(Math.random() * allIcons.length);
    const selected = allIcons[randomIndex];
    currentIcon = selected.icon;
    currentThema = selected.thema;
    currentQuestion = {
      vraag: selected.vraag,
      opties: selected.opties,
      correct: selected.correct
    };
    
    questionsHistory.push({
      icon: currentIcon,
      thema: currentThema,
      vraag: currentQuestion.vraag,
      opties: currentQuestion.opties,
      correct: currentQuestion.correct,
      timestamp: new Date().toISOString()
    });
    currentQuestionIndex = questionsHistory.length;
    
    wheel.classList.remove('spinning');
    wheel.innerHTML = `<div class="wheel-icon" style="font-size: 6rem;">${currentIcon}</div>`;
    
    updateQuestionCounter();
    
    await bingoSessions.doc(currentSessionId).update({
      currentSpin: {
        icon: currentIcon,
        thema: currentThema,
        vraag: currentQuestion.vraag,
        opties: currentQuestion.opties,
        correct: currentQuestion.correct
      },
      questionsHistory: questionsHistory
    });
    
    showCurrentQuestion({
      icon: currentIcon,
      thema: currentThema,
      vraag: currentQuestion.vraag,
      opties: currentQuestion.opties
    });

    // Na het updaten van de sessie
    updateHistoryDisplay();
    
  } catch (error) {
    console.error("Fout bij spinWheel:", error);
    wheel.classList.remove('spinning');
    wheel.innerHTML = '<div class="wheel-icon">❌</div>';
    alert("Fout bij laden vragen: " + error.message);
  }
}

function showCurrentQuestion(spinData) {
  document.getElementById('questionArea').style.display = 'block';
  document.getElementById('currentSubject').innerHTML = `${spinData.icon} ${spinData.thema}`;
  document.getElementById('questionText').innerHTML = spinData.vraag;
  
  const optionsDiv = document.getElementById('options');
  optionsDiv.innerHTML = '';
  spinData.opties.forEach((opt, idx) => {
    const btn = document.createElement('div');
    btn.classList.add('option');
    btn.innerText = opt;
    btn.dataset.idx = idx;
    btn.onclick = () => {
      document.querySelectorAll('#options .option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
      showAnswerFeedback(btn, idx);
    };
    optionsDiv.appendChild(btn);
  });
  
  document.getElementById('feedback').innerHTML = '';
}

function showAnswerFeedback(selectedBtn, selectedIndex) {
  const correctIndex = currentQuestion.correct;
  const feedback = document.getElementById('feedback');
  
  document.querySelectorAll('#options .option').forEach((opt, idx) => {
    if (idx === correctIndex) {
      opt.style.background = '#4caf50';
      opt.style.color = 'white';
    } else if (idx === selectedIndex && idx !== correctIndex) {
      opt.style.background = '#f44336';
      opt.style.color = 'white';
    }
  });
  
  if (selectedIndex === correctIndex) {
    feedback.innerHTML = '<span style="color:#4caf50;">✅ Juist! Leerlingen kunnen vakjes wegstrepen.</span>';
  } else {
    feedback.innerHTML = `<span style="color:#f44336;">❌ Fout! Het juiste antwoord is: ${currentQuestion.opties[correctIndex]}</span>`;
  }
  
  bingoSessions.doc(currentSessionId).update({
    currentAnswerRevealed: true,
    correctAnswer: correctIndex
  }).catch(console.error);
}

async function previousQuestion() {
  if (currentQuestionIndex <= 1) {
    alert("Dit is de eerste vraag, er is geen vorige vraag.");
    return;
  }
  
  currentQuestionIndex--;
  const prevSpin = questionsHistory[currentQuestionIndex - 1];
  
  if (prevSpin) {
    currentIcon = prevSpin.icon;
    currentThema = prevSpin.thema;
    currentQuestion = {
      vraag: prevSpin.vraag,
      opties: prevSpin.opties,
      correct: prevSpin.correct
    };
    
    await bingoSessions.doc(currentSessionId).update({
      currentSpin: {
        icon: currentIcon,
        thema: currentThema,
        vraag: currentQuestion.vraag,
        opties: currentQuestion.opties,
        correct: currentQuestion.correct
      },
      currentAnswerRevealed: false,
      correctAnswer: null
    });
    
    const wheel = document.getElementById('wheel');
    if (wheel) wheel.innerHTML = `<div class="wheel-icon" style="font-size: 6rem;">${currentIcon}</div>`;
    
    updateQuestionCounter();
    showCurrentQuestion({
      icon: currentIcon,
      thema: currentThema,
      vraag: currentQuestion.vraag,
      opties: currentQuestion.opties
    });
  }
}

async function nextQuestion() {
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('feedback').innerHTML = '';
  
  const wheel = document.getElementById('wheel');
  if (wheel) {
    wheel.innerHTML = '';
    wheel.classList.remove('spinning');
  }
  
  await bingoSessions.doc(currentSessionId).update({
    currentSpin: null,
    currentAnswerRevealed: false,
    correctAnswer: null
  });
  
  currentQuestion = null;
  currentIcon = null;
  currentThema = null;
  
  console.log("Klaar voor volgende ronde. Draai opnieuw!");
}

async function endSession() {
  if (!confirm("Weet je zeker dat je deze sessie wilt beëindigen? Leerlingen kunnen niet meer deelnemen.")) {
    return;
  }
  
  try {
    await bingoSessions.doc(currentSessionId).update({
      active: false,
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.location.href = 'sessions.html';
  } catch (error) {
    console.error("Fout bij beëindigen sessie:", error);
    alert("Fout: " + error.message);
  }
}

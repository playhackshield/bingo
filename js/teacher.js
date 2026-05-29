let currentSessionId = null;
let currentQuestion = null;
let currentIcon = null;
let currentThema = null;
let currentQuestionIndex = 0;
let questionsHistory = []; // Geschiedenis van gedraaide vragen

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  
  // Check of er een sessionId in de URL staat
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
  document.getElementById('logout').onclick = () => auth.signOut().then(() => location.reload());
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
    
  } catch (error) {
    console.error("Fout bij laden sessie:", error);
    alert("Kon sessie niet laden: " + error.message);
    window.location.href = 'sessions.html';
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
  
  // Toon groot vraagteken met aftel animatie
  wheel.innerHTML = '<div class="wheel-countdown">?</div>';
  wheel.classList.add('spinning');
  
  // Wacht 2 seconden (simuleert draaien)
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    // Laad alle beschikbare iconen
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
    
    // Bewaar in geschiedenis
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
    };
    optionsDiv.appendChild(btn);
  });
  
  document.getElementById('feedback').innerHTML = '';
}

async function previousQuestion() {
  if (currentQuestionIndex <= 1) {
    alert("Dit is de eerste vraag, er is geen vorige vraag.");
    return;
  }
  
  // Ga naar vorige vraag in geschiedenis
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
    
    showCurrentQuestion({
      icon: currentIcon,
      thema: currentThema,
      vraag: currentQuestion.vraag,
      opties: currentQuestion.opties
    });
  }
}

async function nextQuestion() {
  // Dit is de "Volgende ronde" functionaliteit
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('feedback').innerHTML = '';
  
  // Reset wiel (leegmaken voor volgende ronde)
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

function resetWheel() {
  const wheel = document.getElementById('wheel');
  if (wheel) {
    wheel.innerHTML = '';
    wheel.style.transform = 'rotate(0deg)';
    wheel.classList.remove('spinning');
  }
}

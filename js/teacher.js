let currentSessionId = null;
let currentQuestion = null;
let currentIcon = null;
let currentThema = null;
let currentQuestionIndex = 0;
let questionsHistory = [];
let currentUser = null;
let allAvailableIcons = [];

document.addEventListener('DOMContentLoaded', async () => {
  // Wacht op Firebase auth state
  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      console.log("Geen gebruiker ingelogd, redirect naar login");
      window.location.href = 'index.html';
      return;
    }
    
    if (user.isAnonymous) {
      console.log("Anonieme gebruiker, redirect naar login");
      window.location.href = 'index.html';
      return;
    }
    
    currentUser = user;
    console.log("Ingelogd als:", user.email);
    
    const urlParams = new URLSearchParams(window.location.search);
    const sessionIdFromUrl = urlParams.get('sessionId');
    
    if (sessionIdFromUrl) {
      currentSessionId = sessionIdFromUrl;
      await loadExistingSession(sessionIdFromUrl);
    } else {
      const setupScreen = document.getElementById('setupScreen');
      const activeSession = document.getElementById('activeSession');
      if (setupScreen) setupScreen.style.display = 'block';
      if (activeSession) activeSession.style.display = 'none';
    }
    
    // Event listeners
    const createBtn = document.getElementById('createSessionBtn');
    const prevBtn = document.getElementById('prevQuestionBtn');
    const nextBtn = document.getElementById('nextQuestionBtn');
    const endBtn = document.getElementById('endSessionBtn');
    const wheel = document.getElementById('wheel');
    
    if (createBtn) createBtn.onclick = createSession;
    if (prevBtn) prevBtn.onclick = previousQuestion;
    if (nextBtn) nextBtn.onclick = nextQuestion;
    if (endBtn) endBtn.onclick = endSession;
    if (wheel) wheel.onclick = spinWheel;
  });
});

async function createSession() {
  await loadAllIcons();
  
  const gridSize = parseInt(document.getElementById('gridSize').value);
  const code = generateSessionCode();
  
  const sessionData = {
    code: code,
    gridSize: gridSize,
    active: true,
    teacherId: currentUser.uid,
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
    updatePageTitle(code);
    
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

function updatePageTitle(code) {
  const titleEl = document.getElementById('pageTitle');
  if (titleEl && code) {
    titleEl.textContent = `HackShield Bingo (Code: ${code})`;
  }
}

async function loadExistingSession(sessionId) {
  try {
    await loadAllIcons();
    
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
    updatePageTitle(sessionData.code);
    
    updateQuestionCounter();
    updateHistoryDisplay();
    
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

function updateQuestionCounter() {
  const counterDiv = document.getElementById('currentSubject');
  if (counterDiv && currentThema && currentQuestionIndex > 0) {
    counterDiv.innerHTML = `Vraag ${currentQuestionIndex}: ${currentThema}`;
  } else if (counterDiv && questionsHistory.length === 0) {
    counterDiv.innerHTML = 'Nog geen vragen gedraaid';
  } else if (counterDiv && currentThema) {
    counterDiv.innerHTML = `Vraag ${currentQuestionIndex}: ${currentThema}`;
  }
}

async function loadPlayers() {
  bingoPlayers.where('sessionId', '==', currentSessionId).onSnapshot(snapshot => {
    const playersTitle = document.getElementById('playersTitle');
    if (playersTitle) {
      playersTitle.innerHTML = `Deelnemers (${snapshot.size})`;
    }
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

async function loadAllIcons() {
  try {
    const res = await fetch('data/vragen.json');
    const allQuestions = await res.json();
    
    allAvailableIcons = [];
    allQuestions.forEach(q => {
      q.iconen.forEach(icon => {
        allAvailableIcons.push({
          icon: icon,
          thema: q.thema,
          vraag: q.vraag,
          opties: q.opties,
          correct: q.correct
        });
      });
    });
    console.log(`${allAvailableIcons.length} iconen geladen`);
  } catch (error) {
    console.error("Fout bij laden iconen:", error);
  }
}

async function spinWheel() {
  const wheel = document.getElementById('wheel');
  if (!wheel) return;
  
  console.log("=== SPIN WHEEL DEBUG ===");
  console.log("QuestionsHistory lengte (thema's):", questionsHistory.length);
  
  // Haal alle beschikbare thema's op (uniek per thema, niet per icoon)
  let allAvailableThemas = [];
  try {
    const res = await fetch('data/vragen.json');
    const allQuestions = await res.json();
    
    // Gebruik het eerste icoon van elk thema, maar tel elk thema maar één keer
    allQuestions.forEach(q => {
      // Neem het eerste icoon als representant van het thema
      const firstIcon = q.iconen[0];
      allAvailableThemas.push({
        icon: firstIcon,
        thema: q.thema,
        vraag: q.vraag,
        opties: q.opties,
        correct: q.correct,
        alleIconen: q.iconen // Bewaar alle iconen voor eventueel later gebruik
      });
    });
  } catch (error) {
    console.error("Fout bij laden thema's:", error);
    alert("Fout bij laden vragen: " + error.message);
    return;
  }
  
  console.log("Totaal beschikbare thema's:", allAvailableThemas.length);
  
  // Bepaal welke thema's al gebruikt zijn (op basis van thema-naam)
  const usedThemas = questionsHistory.map(item => item.thema);
  console.log("Gebruikte thema's:", usedThemas);
  
  // Filter de niet-gebruikte thema's
  const remainingThemas = allAvailableThemas.filter(thema => 
    !usedThemas.includes(thema.thema)
  );
  
  console.log("Resterende thema's:", remainingThemas.length);
  
  if (remainingThemas.length === 0) {
    alert("Alle thema's zijn geweest! Je kunt een nieuwe sessie starten of de geschiedenis resetten.");
    return;
  }
  
  // Toon draaiende animatie
  wheel.innerHTML = '<i class="fas fa-cog fa-spin wheel-icon-default" style="font-size: 4rem;"></i>';
  wheel.classList.add('spinning');
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  try {
    const randomIndex = Math.floor(Math.random() * remainingThemas.length);
    const selected = remainingThemas[randomIndex];
    
    console.log("Gekozen thema:", selected.thema, "met icoon:", selected.icon);
    
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
      alleIconen: selected.alleIconen, // Bewaar voor als je later meerdere iconen wilt tonen
      timestamp: new Date().toISOString()
    });
    currentQuestionIndex = questionsHistory.length;
    
    wheel.classList.remove('spinning');
    wheel.innerHTML = `<div class="wheel-icon">${currentIcon}</div>`;
    
    updateQuestionCounter();
    updateHistoryDisplay();
    
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
    wheel.innerHTML = '<i class="fas fa-cog wheel-icon-default"></i>';
    alert("Fout: " + error.message);
  }
}

// Helper functie om alle beschikbare iconen te laden
function getAllAvailableIcons() {
  // Deze functie moet alle iconen uit de JSON laden
  // We slaan ze op in een globale variabele bij het laden van de pagina
  if (window.allAvailableIcons) {
    return window.allAvailableIcons;
  }
  return []; // Fallback
}

function showCurrentQuestion(spinData) {
  document.getElementById('questionArea').style.display = 'block';
  document.getElementById('questionText').innerHTML = spinData.vraag;
  
  if (currentQuestionIndex > 0) {
    document.getElementById('currentSubject').innerHTML = `Vraag ${currentQuestionIndex}: ${spinData.thema}`;
  } else {
    document.getElementById('currentSubject').innerHTML = `Vraag ${questionsHistory.length}: ${spinData.thema}`;
  }
  
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

function updateHistoryDisplay() {
  const historyContainer = document.getElementById('historyList');
  if (!historyContainer) return;
  
  if (!questionsHistory || questionsHistory.length === 0) {
    historyContainer.innerHTML = '<div class="empty-history">Nog geen iconen getrokken</div>';
    return;
  }
  
  historyContainer.innerHTML = '';
  
  const reversedHistory = [...questionsHistory].reverse();
  
  reversedHistory.forEach((item, idx) => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `<div class="history-icon">${item.icon}</div>`;
    historyItem.title = `${item.thema} - ${item.vraag.substring(0, 50)}...`;
    historyItem.onclick = () => {
      const vraagNummer = questionsHistory.length - idx;
      if (confirm(`Ga naar vraag ${vraagNummer}: ${item.thema}?`)) {
        jumpToQuestion(vraagNummer - 1);
      }
    };
    historyContainer.appendChild(historyItem);
  });
}

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
  if (wheel) wheel.innerHTML = `<div class="wheel-icon">${currentIcon}</div>`;
  
  updateQuestionCounter();
  updateHistoryDisplay();
  showCurrentQuestion({
    icon: currentIcon,
    thema: currentThema,
    vraag: currentQuestion.vraag,
    opties: currentQuestion.opties
  });
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
    if (wheel) wheel.innerHTML = `<div class="wheel-icon">${currentIcon}</div>`;
    
    updateQuestionCounter();
    updateHistoryDisplay();
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
    wheel.innerHTML = '<i class="fas fa-cog wheel-icon-default"></i>';
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
  
  console.log("Klaar voor volgende ronde. Klik op het wiel om te draaien!");
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

function resetQuestionsHistory() {
  if (confirm("Weet je zeker dat je de geschiedenis wilt resetten? Alle vragen kunnen opnieuw verschijnen.")) {
    questionsHistory = [];
    currentQuestionIndex = 0;
    updateHistoryDisplay();
    updateQuestionCounter();
    
    bingoSessions.doc(currentSessionId).update({
      questionsHistory: []
    });
  }
}

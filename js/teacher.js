let currentSessionId = null;
let currentQuestion = null;
let currentIcon = null;
let currentThema = null;

// Voeg toe aan het begin van teacher.js, na de variabele declaraties
document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  
  // Check of er een sessionId in de URL staat
  const urlParams = new URLSearchParams(window.location.search);
  const sessionIdFromUrl = urlParams.get('sessionId');
  
  if (sessionIdFromUrl) {
    // Hervat bestaande sessie
    currentSessionId = sessionIdFromUrl;
    await loadExistingSession(sessionIdFromUrl);
  } else {
    // Normale flow: toon setup scherm
    document.getElementById('setupScreen').style.display = 'block';
    document.getElementById('activeSession').style.display = 'none';
  }
  
  // Event listeners (zoals eerder)
  document.getElementById('createSessionBtn').onclick = createSession;
  // ... rest van event listeners ...
});

// Nieuwe functie om bestaande sessie te laden
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
    
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('activeSession').style.display = 'block';
    document.getElementById('sessionCode').innerText = sessionData.code;
    
    // Laad spelers en claims
    loadPlayers();
    loadClaims();
    
    // Als er een actieve spin is, toon de vraag
    if (sessionData.currentSpin && sessionData.currentSpin.icon) {
      showCurrentQuestion(sessionData.currentSpin);
    }
    
    // Luister naar veranderingen
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

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  
  // Event listeners
  document.getElementById('createSessionBtn').onclick = createSession;
  document.getElementById('spinBtn').onclick = spinWheel;
  document.getElementById('revealAnswerBtn').onclick = revealAnswer;
  document.getElementById('forceNextRound').onclick = forceNextRound;
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
    correctAnswer: null
  };
  
  try {
    const docRef = await bingoSessions.add(sessionData);
    currentSessionId = docRef.id;
    
    document.getElementById('setupScreen').style.display = 'none';
    document.getElementById('activeSession').style.display = 'block';
    document.getElementById('sessionCode').innerText = code;
    
    // Laad spelers en claims
    loadPlayers();
    loadClaims();
    
    // Luister naar sessie veranderingen
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

async function loadPlayers() {
  bingoPlayers.where('sessionId', '==', currentSessionId).onSnapshot(snapshot => {
    document.getElementById('playerCount').innerText = snapshot.size;
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    snapshot.forEach(doc => {
      const p = doc.data();
      const li = document.createElement('li');
      li.innerText = `${p.name} (goed: ${p.correctCount || 0})`;
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
      li.innerText = `${claim.name} riep BINGO! om ${time}`;
      list.appendChild(li);
    });
  });
}

async function spinWheel() {
  const wheel = document.getElementById('wheel');
  if (!wheel) {
    console.error("Wiel element niet gevonden!");
    return;
  }
  
  // Wis eventuele bestaande inhoud
  wheel.innerHTML = '';
  wheel.classList.add('spinning');
  
  try {
    // Laad alle beschikbare iconen uit vragen.json
    const res = await fetch('data/vragen.json');
    const allQuestions = await res.json();
    
    // Maak lijst van alle iconen (plat)
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
    
    // Wacht tot animatie klaar is (4s)
    setTimeout(async () => {
      wheel.classList.remove('spinning');
      // Toon het gekozen icoon groot in het wiel
      wheel.innerHTML = `<div class="wheel-icon" style="font-size: 6rem;">${currentIcon}</div>`;
      
      // Update Firestore sessie met gedraaid onderwerp
      await bingoSessions.doc(currentSessionId).update({
        currentSpin: {
          icon: currentIcon,
          thema: currentThema,
          vraag: currentQuestion.vraag,
          opties: currentQuestion.opties,
          correct: currentQuestion.correct
        }
      });
      
      // Toon vraag gedeelte
      showCurrentQuestion({
        icon: currentIcon,
        thema: currentThema,
        vraag: currentQuestion.vraag,
        opties: currentQuestion.opties
      });
    }, 4000);
    
  } catch (error) {
    console.error("Fout bij spinWheel:", error);
    wheel.classList.remove('spinning');
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
  document.getElementById('revealAnswerBtn').disabled = false;
  document.getElementById('revealAnswerBtn').style.display = 'inline-block';
}

async function revealAnswer() {
  const selectedOption = document.querySelector('#options .option.selected');
  const correctIndex = currentQuestion.correct;
  const correctText = currentQuestion.opties[correctIndex];
  
  // Highlight juiste antwoord
  document.querySelectorAll('#options .option').forEach((opt, idx) => {
    if (idx === correctIndex) {
      opt.style.background = '#4caf50';
      opt.style.color = 'white';
    } else {
      opt.style.background = 'rgba(255,255,255,0.2)';
    }
  });
  
  // Toon feedback
  const feedback = document.getElementById('feedback');
  if (selectedOption && parseInt(selectedOption.dataset.idx) === correctIndex) {
    feedback.innerHTML = '<span style="color:#a5d6a7;">✅ Juist! Leerlingen mogen nu het icoon wegstrepen.</span>';
  } else {
    feedback.innerHTML = '<span style="color:#ffcdd2;">❌ Fout! Het juiste antwoord is hierboven gemarkeerd. Leerlingen mogen deze ronde geen vakje wegstrepen.</span>';
  }
  
  // Update Firestore dat antwoord is onthuld
  await bingoSessions.doc(currentSessionId).update({
    currentAnswerRevealed: true,
    correctAnswer: correctIndex
  });
  
  document.getElementById('revealAnswerBtn').disabled = true;
}

function resetWheel() {
  const wheel = document.getElementById('wheel');
  if (wheel) {
    wheel.innerHTML = '';
    wheel.style.transform = 'rotate(0deg)';
    wheel.classList.remove('spinning');
  }
}

async function forceNextRound() {
  console.log("Forceer volgende ronde...");
  
  // Reset vraag area en wiel
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('revealAnswerBtn').disabled = false;
  document.getElementById('feedback').innerHTML = '';
  document.getElementById('revealAnswerBtn').style.display = 'inline-block';
  
  // Reset het wiel (verwijder het icoon)
  resetWheel();
  
  // Reset de huidige spin data in Firestore (zodat studenten weten dat er geen actieve vraag is)
  await bingoSessions.doc(currentSessionId).update({
    currentSpin: null,
    currentAnswerRevealed: false,
    correctAnswer: null
  });
  
  // Verwijder de opgeslagen huidige vraag uit de lokale variabelen
  currentQuestion = null;
  currentIcon = null;
  currentThema = null;
  
  console.log("Klaar voor volgende ronde. Je kunt opnieuw draaien.");
}

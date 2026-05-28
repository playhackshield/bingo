let currentSessionId = null;
let currentQuestion = null;
let currentIcon = null;
let currentThema = null;

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
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
    code,
    gridSize,
    active: true,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    currentSpin: null,
    currentQuestion: null,
    currentIcon: null
  };
  const docRef = await bingoSessions.add(sessionData);
  currentSessionId = docRef.id;
  document.getElementById('setupScreen').style.display = 'none';
  document.getElementById('activeSession').style.display = 'block';
  document.getElementById('sessionCode').innerText = code;
  // Laad spelers
  loadPlayers();
  loadClaims();
  // Luister naar veranderingen in sessie (voor spelers die claimen)
  bingoSessions.doc(currentSessionId).onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.currentSpin) {
        // Toon de gedraaide vraag
        showCurrentQuestion(data.currentSpin);
      }
    }
  });
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
      const li = document.createElement('li');
      li.innerText = `${claim.name} riep BINGO! om ${claim.timestamp?.toDate().toLocaleTimeString()}`;
      list.appendChild(li);
    });
  });
}

async function spinWheel() {
  const wheel = document.getElementById('wheel');
  wheel.classList.add('spinning');
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
    // Toon vraag gedeelte direct ook op leraarscherm
    showCurrentQuestion({
      icon: currentIcon,
      thema: currentThema,
      vraag: currentQuestion.vraag,
      opties: currentQuestion.opties
    });
  }, 4000);
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
      document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
      btn.classList.add('selected');
    };
    optionsDiv.appendChild(btn);
  });
  document.getElementById('feedback').innerHTML = '';
  document.getElementById('revealAnswerBtn').style.display = 'inline-block';
}

async function revealAnswer() {
  // Haal geselecteerde antwoord op (leraar ziet het, maar toont wel het juiste antwoord)
  const selectedOption = document.querySelector('#options .option.selected');
  const correctIndex = currentQuestion.correct;
  const correctText = currentQuestion.opties[correctIndex];
  // Highlight juiste antwoord
  document.querySelectorAll('#options .option').forEach((opt, idx) => {
    if (idx === correctIndex) {
      opt.style.background = '#4caf50';
      opt.style.color = 'white';
    } else {
      opt.style.background = '#f0f0f0';
    }
  });
  // Toon feedback
  const feedback = document.getElementById('feedback');
  if (selectedOption && parseInt(selectedOption.dataset.idx) === correctIndex) {
    feedback.innerHTML = '<span style="color:green;">✅ Juist! Leerlingen mogen nu het icoon wegstrepen.</span>';
  } else {
    feedback.innerHTML = '<span style="color:red;">❌ Fout! Het juiste antwoord is hierboven gemarkeerd. Leerlingen mogen deze ronde geen vakje wegstrepen.</span>';
  }
  // Reset de vraagarea na 3 seconden? Of wacht op leraar om volgende ronde te starten.
  // We doen niets, leraar kan daarna op "Forceer volgende ronde" klikken.
  // Maar we moeten in de sessie een veld zetten dat de vraag is afgerond, zodat leerlingen feedback krijgen.
  await bingoSessions.doc(currentSessionId).update({
    currentAnswerRevealed: true,
    correctAnswer: correctIndex
  });
  document.getElementById('revealAnswerBtn').disabled = true;
}

function forceNextRound() {
  // Reset vraag area en wiel, zodat leraar opnieuw kan draaien
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('revealAnswerBtn').disabled = false;
  document.getElementById('feedback').innerHTML = '';
  // Verwijder huidige spin uit Firestore (optioneel)
  bingoSessions.doc(currentSessionId).update({
    currentSpin: null,
    currentAnswerRevealed: false,
    correctAnswer: null
  });
}
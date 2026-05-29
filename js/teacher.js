// Vervang de spinWheel functie
async function spinWheel() {
  const wheel = document.getElementById('wheel');
  // Wis eventuele bestaande inhoud
  wheel.innerHTML = '';
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
    // Toon het gekozen icoon groot in het wiel
    wheel.innerHTML = `<div class="wheel-icon">${currentIcon}</div>`;
    
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

// Voeg een functie toe om het wiel te resetten voor de volgende ronde
function resetWheel() {
  const wheel = document.getElementById('wheel');
  wheel.innerHTML = '';
  wheel.style.transform = 'rotate(0deg)';
}

// Pas de forceNextRound functie aan
async function forceNextRound() {
  // Reset vraag area en wiel
  document.getElementById('questionArea').style.display = 'none';
  document.getElementById('revealAnswerBtn').disabled = false;
  document.getElementById('feedback').innerHTML = '';
  
  // Reset het wiel (verwijder het icoon)
  resetWheel();
  
  // Verwijder huidige spin uit Firestore
  await bingoSessions.doc(currentSessionId).update({
    currentSpin: null,
    currentAnswerRevealed: false,
    correctAnswer: null
  });
}

let currentSession = null;
let currentPlayer = null;
let bingoCard = [];
let gridSize = 0;
let allQuestions = [];

document.addEventListener('DOMContentLoaded', async () => {
  await anonymousLogin();
  const res = await fetch('data/vragen.json');
  allQuestions = await res.json();
  
  document.getElementById('joinBtn').onclick = joinSession;
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
    bonusAvailable: false,
    joinedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  const playerRef = await bingoPlayers.add(playerData);
  currentPlayer = { id: playerRef.id, ...playerData };

  // Toon spel scherm
  document.getElementById('joinScreen').style.display = 'none';
  document.getElementById('gameScreen').style.display = 'block';
  document.getElementById('sessionCodeDisplay').innerText = code;
  document.getElementById('playerNameDisplay').innerText = name;
  bingoCard = card;
  renderBingoCard();

  // Luister naar updates van de kaart (voor als de leraar iets reset)
  bingoPlayers.doc(currentPlayer.id).onSnapshot((doc) => {
    if (doc.exists) {
      const updated = doc.data();
      if (updated.card) {
        bingoCard = updated.card;
        renderBingoCard();
      }
    }
  });
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
    
    // Altijd vrij om aan/uit te vinken
    div.onclick = () => {
      // Vink aan of uit
      const newStreaked = !cell.streaked;
      bingoCard[idx].streaked = newStreaked;
      renderBingoCard(); // Hertekenen voor directe feedback
      
      // Opslaan in Firebase
      bingoPlayers.doc(currentPlayer.id).update({
        card: bingoCard
      }).catch(err => console.error("Fout bij opslaan:", err));
    };
    
    container.appendChild(div);
  });
}

async function claimBingo() {
  if (!currentSession || !currentPlayer) {
    alert("Nog niet verbonden met een sessie.");
    return;
  }
  
  // Controleer of er een bingo is
  const hasBingo = checkBingo();
  if (!hasBingo) {
    alert("Je hebt nog geen bingo! Streep eerst een volledige rij, kolom of diagonaal.");
    return;
  }
  
  // Registreer claim
  try {
    await bingoClaims.add({
      sessionId: currentSession.id,
      playerId: currentPlayer.id,
      name: currentPlayer.name,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("🎉 BINGO geclaimd! Je naam verschijnt op het digibord.");
  } catch (error) {
    console.error("Fout bij claimen:", error);
    alert("Fout bij claimen: " + error.message);
  }
}

function checkBingo() {
  const size = gridSize;
  let grid = [];
  for (let i = 0; i < size; i++) {
    grid.push(bingoCard.slice(i * size, (i + 1) * size));
  }
  
  // Rijen
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
  
  // Diagonaal 1
  let diag1 = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][i].streaked) diag1 = false;
  }
  if (diag1) return true;
  
  // Diagonaal 2
  let diag2 = true;
  for (let i = 0; i < size; i++) {
    if (!grid[i][size - 1 - i].streaked) diag2 = false;
  }
  return diag2;
}

// Verwijder de functies voor vragen beantwoorden (niet meer nodig)
function showStudentQuestion() {} // Leeg, want geen vragen meer
function submitAnswer() {} // Leeg

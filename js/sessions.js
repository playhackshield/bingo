// Sessiebeheer logica
let currentTeacherId = null;
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Wacht op Firebase auth state
    firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) {
        // Niet ingelogd, redirect naar login
        console.log("Geen gebruiker ingelogd, redirect naar login");
        window.location.href = 'index.html';
        return;
      }
      
      // Check of het een anonieme gebruiker is (die mag niet hier komen)
      if (user.isAnonymous) {
        console.log("Anonieme gebruiker, redirect naar login");
        window.location.href = 'index.html';
        return;
      }
      
      // Echte ingelogde gebruiker
      currentUser = user;
      currentTeacherId = user.uid;
      console.log("Ingelogd als:", user.email);
      
      // Event listeners
      document.getElementById('createSessionBtn').onclick = createNewSession;
      document.getElementById('logoutBtn').onclick = () => {
        firebase.auth().signOut().then(() => {
          window.location.href = 'index.html';
        });
      };
      
      // Laad sessies
      loadActiveSessions();
      loadEndedSessions();
    });
    
  } catch (error) {
    console.error("Initialisatie fout:", error);
    alert("Fout bij laden: " + error.message);
  }
});

async function createNewSession() {
  const gridSize = parseInt(document.getElementById('newGridSize').value);
  
  // Bereken benodigd aantal thema's (gridSize = totaal aantal vakjes)
  // Bij 4x4 is gridSize 16, maar we hebben √16 = 4 nodig voor de dimensie
  // Het aantal benodigde unieke thema's is gelijk aan gridSize (aantal vakjes)
  const requiredThemes = gridSize;
  
  // Toon loading state
  const createBtn = document.getElementById('createSessionBtn');
  const originalText = createBtn.innerHTML;
  createBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Controleren...';
  createBtn.disabled = true;
  
  try {
    // Controleer aantal beschikbare thema's
    const availableThemes = await getAvailableThemesCount();
    
    if (availableThemes < requiredThemes) {
      alert(`❌ Niet genoeg thema's!\n\nJe hebt ${requiredThemes} thema's nodig voor een ${Math.sqrt(gridSize)}x${Math.sqrt(gridSize)} grid (${gridSize} vakjes).\n\nEr zijn momenteel slechts ${availableThemes} thema's beschikbaar.\n\nVoeg eerst meer thema's toe aan vragen.json of kies een kleiner grid.`);
      createBtn.innerHTML = originalText;
      createBtn.disabled = false;
      return;
    }
    
    // Genereer code en maak sessie aan
    const code = generateSessionCode();
    
    const sessionData = {
      code: code,
      gridSize: gridSize,
      active: true,
      teacherId: currentTeacherId,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      currentSpin: null,
      currentQuestion: null,
      currentIcon: null,
      currentAnswerRevealed: false,
      correctAnswer: null,
      questionsHistory: []
    };
    
    const docRef = await bingoSessions.add(sessionData);
    console.log("Sessie aangemaakt:", docRef.id, "Code:", code);
    
    alert(`✅ Sessie aangemaakt!\nCode: ${code}\n${availableThemes} thema's beschikbaar voor ${requiredThemes} vakjes.\nKlik OK om naar de leraarpagina te gaan.`);
    
    window.location.href = `teacher.html?sessionId=${docRef.id}`;
    
  } catch (error) {
    console.error("Fout bij aanmaken sessie:", error);
    alert("Fout: " + error.message);
    createBtn.innerHTML = originalText;
    createBtn.disabled = false;
  }
}

async function loadActiveSessions() {
  try {
    const snapshot = await bingoSessions
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .get();
    
    const container = document.getElementById('activeSessionsList');
    
    if (snapshot.empty) {
      container.innerHTML = '<div class="empty-state">🎯 Geen actieve sessies</div>';
      return;
    }
    
    container.innerHTML = '';
    snapshot.forEach(doc => {
      const session = doc.data();
      const sessionId = doc.id;
      const date = session.createdAt?.toDate().toLocaleString() || 'Onbekend';
      const playerCount = session.playerCount || 0;
      
      const sessionCard = document.createElement('div');
      sessionCard.className = 'session-card';
      sessionCard.innerHTML = `
        <div class="session-info">
          <div class="session-code">🔑 Code: <strong>${session.code}</strong></div>
          <div class="session-details">
            <span><i class="fas fa-calendar"></i> ${date}</span>
            <span><i class="fas fa-users"></i> ${playerCount} spelers</span>
            <span><i class="fas fa-table"></i> ${session.gridSize} vakjes</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn-primary resume-session" data-id="${sessionId}">
            <i class="fas fa-play"></i> Hervatten
          </button>
          <button class="btn-secondary end-session" data-id="${sessionId}">
            <i class="fas fa-stop"></i> Beëindigen
          </button>
        </div>
      `;
      container.appendChild(sessionCard);
    });
    
    document.querySelectorAll('.resume-session').forEach(btn => {
      btn.onclick = () => resumeSession(btn.dataset.id);
    });
    document.querySelectorAll('.end-session').forEach(btn => {
      btn.onclick = () => endSession(btn.dataset.id);
    });
    
  } catch (error) {
    console.error("Fout bij laden actieve sessies:", error);
    document.getElementById('activeSessionsList').innerHTML = '<div class="error">Fout bij laden sessies</div>';
  }
}

async function loadEndedSessions() {
  try {
    const snapshot = await bingoSessions
      .where('active', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();
    
    const container = document.getElementById('endedSessionsList');
    
    if (snapshot.empty) {
      container.innerHTML = '<div class="empty-state">📭 Geen beëindigde sessies</div>';
      return;
    }
    
    container.innerHTML = '';
    snapshot.forEach(doc => {
      const session = doc.data();
      const sessionId = doc.id;
      const date = session.createdAt?.toDate().toLocaleString() || 'Onbekend';
      const endDate = session.endedAt?.toDate().toLocaleString() || 'Onbekend';
      const playerCount = session.playerCount || 0;
      
      const sessionCard = document.createElement('div');
      sessionCard.className = 'session-card ended';
      sessionCard.innerHTML = `
        <div class="session-info">
          <div class="session-code">🔑 Code: <strong>${session.code}</strong></div>
          <div class="session-details">
            <span><i class="fas fa-calendar"></i> Gestart: ${date}</span>
            <span><i class="fas fa-calendar-check"></i> Beëindigd: ${endDate}</span>
            <span><i class="fas fa-users"></i> ${playerCount} spelers</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="btn-secondary view-session" data-id="${sessionId}">
            <i class="fas fa-eye"></i> Bekijk
          </button>
          <button class="btn-danger delete-session" data-id="${sessionId}">
            <i class="fas fa-trash"></i> Verwijder
          </button>
        </div>
      `;
      container.appendChild(sessionCard);
    });
    
    document.querySelectorAll('.view-session').forEach(btn => {
      btn.onclick = () => viewSession(btn.dataset.id);
    });
    document.querySelectorAll('.delete-session').forEach(btn => {
      btn.onclick = () => deleteSession(btn.dataset.id);
    });
    
  } catch (error) {
    console.error("Fout bij laden archief sessies:", error);
    document.getElementById('endedSessionsList').innerHTML = '<div class="error">Fout bij laden archief</div>';
  }
}

async function resumeSession(sessionId) {
  window.location.href = `teacher.html?sessionId=${sessionId}`;
}

async function endSession(sessionId) {
  if (!confirm("Weet je zeker dat je deze sessie wilt beëindigen? Leerlingen kunnen niet meer deelnemen.")) {
    return;
  }
  
  try {
    await bingoSessions.doc(sessionId).update({
      active: false,
      endedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Sessie beëindigd");
    loadActiveSessions();
    loadEndedSessions();
  } catch (error) {
    console.error("Fout bij beëindigen sessie:", error);
    alert("Fout: " + error.message);
  }
}

async function viewSession(sessionId) {
  window.location.href = `teacher.html?sessionId=${sessionId}&readonly=true`;
}

async function deleteSession(sessionId) {
  if (!confirm("Weet je zeker dat je deze sessie PERMANENT wilt verwijderen? Alle spelers en claims worden ook verwijderd!")) {
    return;
  }
  
  try {
    const playersSnapshot = await bingoPlayers.where('sessionId', '==', sessionId).get();
    const batch = db.batch();
    playersSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    const claimsSnapshot = await bingoClaims.where('sessionId', '==', sessionId).get();
    claimsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    batch.delete(bingoSessions.doc(sessionId));
    await batch.commit();
    
    alert("Sessie en alle bijbehorende data verwijderd");
    loadActiveSessions();
    loadEndedSessions();
    
  } catch (error) {
    console.error("Fout bij verwijderen sessie:", error);
    alert("Fout: " + error.message);
  }
}


// Telt het aantal unieke thema's in vragen.json
async function getAvailableThemesCount() {
  try {
    const res = await fetch('data/vragen.json');
    const allQuestions = await res.json();
    // Elk object in de array is een uniek thema
    return allQuestions.length;
  } catch (error) {
    console.error("Fout bij laden vragen.json:", error);
    return 0;
  }
}

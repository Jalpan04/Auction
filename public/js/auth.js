import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, set, ref, db, get, child } from './firebase-config.js';
import { getEl } from './utils.js';

// Robust Logic: Global Event Delegation & UI State RESTORED
console.log("Auth Module Loaded - V6-ForceUpdate");

// Global Crash Handler for this module
window.addEventListener('error', (e) => {
    console.error("Global Error Caught:", e.message);
});

let authMode = 'LOGIN';

// Use Capture Phase to ensure we see the click before anything stops it
window.addEventListener('click', (e) => {
    try {
        const target = e.target;
        // DEBUG: Trace every click
        console.log("Global Capture Click:", target, "ID:", target.id);
        
        const id = target.id;
        
        // Handle bubbling for elements with children (like SVG buttons)
        if (target.closest('#toggle-password')) {
            const span = target.closest('#toggle-password');
            handlePasswordToggle(span);
            // Don't return, let it bubble unless we want to stop
        }

        if (!id) return;

        // Tabs
        if (id === 'tab-login') { 
            console.log("Action: Login Tab"); 
            switchAuthMode('LOGIN'); 
        }
        if (id === 'tab-register') { 
            console.log("Action: Register Tab"); 
            switchAuthMode('REGISTER'); 
        }

        // Submit
        if (id === 'btn-enter') {
            console.log("Action: Submit");
            e.preventDefault();
            const user = getEl('username-input').value;
            const pass = getEl('password-input').value;
            const confirm = getEl('confirm-password-input') ? getEl('confirm-password-input').value : "";
            handleAuthAction(user, pass, confirm);
        }
    } catch (err) {
        console.error("Click Handler Crash:", err);
    }
}, true); // CAPTURE = TRUE

function switchAuthMode(mode) {
    console.log("Switching Mode:", mode);
    authMode = mode;
    const btnLogin = document.getElementById('tab-login');
    const btnReg = document.getElementById('tab-register');
    const regFields = document.getElementById('register-fields');
    const mainBtn = document.getElementById('btn-enter');
    const msg = document.getElementById('auth-msg');

    if (!btnLogin || !btnReg) { console.error("Tabs missing!"); return; }

    msg.textContent = ""; 

    if (mode === 'LOGIN') {
        btnLogin.style.color = 'white';
        btnLogin.style.borderBottom = '2px solid var(--accent-color)';
        btnLogin.classList.add('active');
        
        btnReg.style.color = '#888';
        btnReg.style.borderBottom = 'none';
        btnReg.classList.remove('active');
        
        if(regFields) regFields.classList.add('hidden');
        mainBtn.textContent = "LOGIN";
    } else {
        btnReg.style.color = 'white';
        btnReg.style.borderBottom = '2px solid var(--accent-color)';
        btnReg.classList.add('active');

        btnLogin.style.color = '#888';
        btnLogin.style.borderBottom = 'none';
        btnLogin.classList.remove('active');
        
        if(regFields) regFields.classList.remove('hidden');
        mainBtn.textContent = "REGISTER";
    }
}

async function handleAuthAction(username, password, confirmPassword) {
    console.log("Auth Action:", authMode, username);
    const msgEl = document.getElementById('auth-msg');
    const btn = document.getElementById('btn-enter');
    
    msgEl.textContent = "";
    
    if (!username || username.trim().length < 3) return showError("Username must be 3+ chars.");
    if (!password || password.length < 4) return showError("Password must be 4+ chars.");
    
    if (authMode === 'REGISTER') {
        if (password !== confirmPassword) return showError("Passwords do not match!");
    }

    const cleanUser = username.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (cleanUser.length < 3) return showError("Username contains invalid characters.");

    const generatedEmail = `${cleanUser}@auction.app`;
    
    btn.disabled = true;
    btn.textContent = "PROCESSING...";

    try {
        if (authMode === 'LOGIN') {
            await signInWithEmailAndPassword(auth, generatedEmail, password);
             console.log("Login call complete.");
        } else {
            console.log(`Registering: ${generatedEmail}`);
            const cred = await createUserWithEmailAndPassword(auth, generatedEmail, password);
            console.log("Register call complete. UID:", cred.user.uid);
            
            const user = cred.user; 
            await set(ref(db, `users/${user.uid}`), {
                username: username.trim(),
                balance: 0,
                createdAt: Date.now()
            });
            console.log("User data set.");
        }
    } catch (e) {
        console.error(e);
        let errorMsg = e.message;
        if (e.code === 'auth/invalid-email') errorMsg = "Invalid Username format.";
        if (e.code === 'auth/user-not-found') errorMsg = "User not found. Please Register.";
        if (e.code === 'auth/wrong-password') errorMsg = "Incorrect Password.";
        if (e.code === 'auth/email-already-in-use') errorMsg = "Username already taken.";
        
        showError(errorMsg);
        btn.disabled = false;
        btn.textContent = authMode;
    }
}

function showError(msg) {
    const el = document.getElementById('auth-msg');
    if(el) el.textContent = msg;
    setTimeout(() => {
        const btn = document.getElementById('btn-enter');
        if(btn) {
            btn.disabled = false;
            btn.textContent = authMode;
        }
    }, 500);
}

function handlePasswordToggle(span) {
    const input = document.getElementById('password-input');
    if (!input) return;
    if (input.type === "password") {
        input.type = "text";
        span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;
    } else {
        input.type = "password";
        span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>`;
    }
}

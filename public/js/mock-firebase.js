// Mock Firebase implementation for local testing
// Simulates Auth and Realtime Database in memory WITH PERSISTENCE

// Load Initial State
const savedDB = localStorage.getItem('MOCK_DB');
const savedUser = localStorage.getItem('MOCK_AUTH_USER');

window.__MOCK_DB__ = savedDB ? JSON.parse(savedDB) : {
    users: {},
    rooms: {}
};

window.__MOCK_AUTH_USER__ = savedUser ? JSON.parse(savedUser) : null;

function saveDB() {
    localStorage.setItem('MOCK_DB', JSON.stringify(window.__MOCK_DB__));
}

const SIMULATED_DELAY_MS = 50; // Faster for local feel

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Auth ---
export const auth = {
    currentUser: window.__MOCK_AUTH_USER__,
    listeners: []
};

// ... (rest of auth)

export const onAuthStateChanged = (authObj, callback) => {
    authObj.listeners.push(callback);
    // Trigger immediately with current state
    callback(authObj.currentUser);
    return () => { // Unsubscribe
        authObj.listeners = authObj.listeners.filter(cb => cb !== callback);
    };
};

export const signInWithEmailAndPassword = async (authObj, email, password) => {
    await delay(SIMULATED_DELAY_MS);
    console.log(`[MOCK] Signing in: ${email}`);
    
    // Very simple mock: If user exists in DB, check pass. 
    // Actually, for this "Test Mode", let's strictly allow ANY login if it's new, 
    // or check password if exists.
    
    // Since we don't store passwords in our DB structure in the prompt example,
    // we'll simulate a separate 'auth store' or just behave like "Auto-SignUp".
    // Let's assume we proceed successfully.
    
    const uid = email.split('@')[0]; // Simple UID from email
    const user = {
        uid: uid,
        email: email
    };
    
    authObj.currentUser = user;
    window.__MOCK_AUTH_USER__ = user;
    localStorage.setItem('MOCK_AUTH_USER', JSON.stringify(user));
    
    authObj.listeners.forEach(cb => cb(user));
    return { user };
};

export const createUserWithEmailAndPassword = async (authObj, email, password) => {
    // Same as sign in for Mock
    return signInWithEmailAndPassword(authObj, email, password);
};

export const signInAnonymously = async (authObj) => {
    await delay(SIMULATED_DELAY_MS);
    const uid = "anon_" + Date.now();
    const user = { uid: uid, email: null, isAnonymous: true };
    authObj.currentUser = user;
    localStorage.setItem('MOCK_AUTH_USER', JSON.stringify(user));
    authObj.listeners.forEach(cb => cb(user));
    return { user };
};

export const signOut = async (authObj) => {
    await delay(SIMULATED_DELAY_MS);
    console.log("[MOCK] Signing out");
    authObj.currentUser = null;
    localStorage.removeItem('MOCK_AUTH_USER');
    authObj.listeners.forEach(cb => cb(null));
};

// --- Realtime Database ---
export const db = {};

export const ref = (db, path) => {
    return { path: path || '/' }; // Root if path undefined
};

export const child = (ref, path) => {
    const newPath = ref.path === '/' ? path : `${ref.path}/${path}`;
    return { path: newPath };
};

// Helper to traverse path
function getRefData(path) {
    const parts = path.split('/').filter(p => p !== '');
    let current = window.__MOCK_DB__;
    for (const part of parts) {
        if (current[part] === undefined) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}

function setRefData(path, value) {
    const parts = path.split('/').filter(p => p !== '');
    let current = window.__MOCK_DB__;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current[part] || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
        current[lastPart] = value;
    } else {
        // Root set? typically we don't set root directly in this app
        if (parts.length === 0) window.__MOCK_DB__ = value;
    }
}

// Helper to update
function updateRefData(path, updates) {
    const parts = path.split('/').filter(p => p !== '');
    let current = window.__MOCK_DB__;
    // Walk to parent
    // If path is root '/'
    if (parts.length === 0) {
        Object.assign(window.__MOCK_DB__, updates);
        return;
    }
    
    // Ensure path exists
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
         if (!current[part] || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part];
    }
    // Now `current` is the target object
    Object.assign(current, updates);
}


export const get = async (ref) => {
    await delay(SIMULATED_DELAY_MS);
    const data = getRefData(ref.path);
    return {
        exists: () => data !== undefined && data !== null,
        val: () => data
    };
};

export const set = async (ref, value) => {
    await delay(SIMULATED_DELAY_MS);
    console.log(`[MOCK] SET ${ref.path}`, value);
    setRefData(ref.path, value);
    saveDB(); // Persist
    triggerListeners(ref.path);
};

export const update = async (ref, values) => {
    await delay(SIMULATED_DELAY_MS);
    
    // Handle root updates like updates['path/to/key'] = val
    // The real implementation supports atomic updates at multiple paths
    // If ref is root, keys in `values` are absolute paths
    
    if (ref.path === undefined || ref.path === '/') {
        // Multi-path update
        console.log(`[MOCK] MULTI-UPDATE`, values);
        Object.keys(values).forEach(path => {
            setRefData(path, values[path]);
            triggerListeners(path);
        });
        saveDB(); // Persist
    } else {
        // Update children of ref
        console.log(`[MOCK] UPDATE ${ref.path}`, values);
        updateRefData(ref.path, values);
        saveDB(); // Persist
        triggerListeners(ref.path);
    }
};

export const push = async (ref, value) => {
    await delay(SIMULATED_DELAY_MS);
    // Generate key
    const key = "key_" + Date.now() + Math.random().toString(36).substr(2, 5);
    const newPath = ref.path === '/' ? key : `${ref.path}/${key}`;
    setRefData(newPath, value);
    saveDB(); // Persist
    triggerListeners(ref.path); // Trigger parent listener
    return { key };
};

export const runTransaction = async (ref, transactionUpdate) => {
    await delay(SIMULATED_DELAY_MS);
    // 1. Get current data
    const currentData = getRefData(ref.path);

    // 2. Apply update function
    const newData = transactionUpdate(currentData);

    if (newData === undefined) {
        return { committed: false, snapshot: { val: () => currentData } };
    }

    // 3. Save
    setRefData(ref.path, newData);
    saveDB();
    triggerListeners(ref.path);

    return { committed: true, snapshot: { val: () => newData } };
};

// Query stubs
export const query = (ref, ...constraints) => {
    // Return object compatible with get()
    return { path: ref.path, constraints };
};
export const orderByChild = (path) => ({ type: 'orderByChild', path });
export const limitToLast = (limit) => ({ type: 'limitToLast', limit });

// --- Listeners ---
const activeListeners = [];

export const onValue = (ref, callback) => {
    const path = ref.path;
    console.log(`[MOCK] LISTENING ${path}`);
    
    const wrapper = () => {
        const data = getRefData(path);
        callback({
            exists: () => data !== undefined && data !== null,
            val: () => data
        });
    };
    
    // Call immediately
    wrapper();
    
    activeListeners.push({ path, callback: wrapper });
    
    return () => { // Unsubscribe
         // remove
    };
};

function triggerListeners(changedPath) {
    // Simple naive trigger: check if listener path is prefix of changedPath or vice versa
    activeListeners.forEach(l => {
        // If changed path is inside listener path (e.g. changed room/1/users, listening to room/1)
        // OR listener path is inside changed path (less common?)
        if (changedPath.startsWith(l.path) || l.path.startsWith(changedPath)) {
             // In a real app we'd debounce, but here we just fire
             // setTimeout(() => l.callback(), 10); 
             l.callback();
        }
    });
}

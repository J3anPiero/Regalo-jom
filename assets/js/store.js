// ==========================================
// 💾 CAPA DE DATOS
// ==========================================
// Con FIREBASE_CONFIG: guarda en Firestore y avisa de los cambios en tiempo real.
// Sin él: guarda en el navegador (localStorage) con la misma interfaz.
//
// Datos:
//   site      → { startDate, texts: {clave: texto}, ratings: {foto: n}, seeded }
//   stories   → lista de historias
//   locations → lista de lugares del mapa
//   photos    → fotos reemplazadas de la galería (id = clave de la foto)

(function () {
    function createFirebaseStore(config) {
        firebase.initializeApp(config);
        const db = firebase.firestore();
        const auth = firebase.auth();
        const siteDoc = db.doc('site/main');

        return {
            remote: true,

            watchSite(callback) {
                return siteDoc.onSnapshot(
                    snap => callback(snap.data() || {}),
                    error => console.error('Error leyendo datos:', error)
                );
            },

            // merge: true combina también los objetos internos (texts, ratings)
            updateSite(partial) {
                return siteDoc.set(partial, { merge: true });
            },

            watchList(name, callback) {
                return db.collection(name).orderBy('createdAt').onSnapshot(
                    snap => callback(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
                    error => console.error(`Error leyendo ${name}:`, error)
                );
            },

            addItem(name, data) {
                return db.collection(name).add({ ...data, createdAt: Date.now() });
            },

            setItem(name, id, data) {
                return db.collection(name).doc(id).set({ createdAt: Date.now(), ...data }, { merge: true });
            },

            deleteItem(name, id) {
                return db.collection(name).doc(id).delete();
            },

            watchAuth(callback) {
                return auth.onAuthStateChanged(callback);
            },

            signIn(email, password) {
                return auth.signInWithEmailAndPassword(email, password);
            },

            signOut() {
                return auth.signOut();
            }
        };
    }

    function createLocalStore() {
        const PREFIX = 'our_journey_v3_';
        const listeners = {};

        function read(key, fallback) {
            try {
                return JSON.parse(localStorage.getItem(PREFIX + key)) ?? fallback;
            } catch (error) {
                return fallback;
            }
        }

        function write(key, value) {
            try {
                localStorage.setItem(PREFIX + key, JSON.stringify(value));
            } catch (error) {
                return Promise.reject(error);
            }
            emit(key);
            return Promise.resolve();
        }

        function current(key) {
            if (key === 'site') return read('site', {});
            return [...read(key, [])].sort((a, b) => a.createdAt - b.createdAt);
        }

        function emit(key) {
            (listeners[key] || []).forEach(callback => callback(current(key)));
        }

        function watch(key, callback) {
            (listeners[key] = listeners[key] || []).push(callback);
            callback(current(key));
        }

        // Cambios hechos en otra pestaña del mismo navegador
        window.addEventListener('storage', (e) => {
            if (e.key && e.key.startsWith(PREFIX)) emit(e.key.slice(PREFIX.length));
        });

        return {
            remote: false,

            watchSite(callback) {
                watch('site', callback);
            },

            updateSite(partial) {
                const site = read('site', {});
                Object.entries(partial).forEach(([key, value]) => {
                    const isObject = value && typeof value === 'object' && !Array.isArray(value);
                    site[key] = isObject ? { ...(site[key] || {}), ...value } : value;
                });
                return write('site', site);
            },

            watchList(name, callback) {
                watch(name, callback);
            },

            addItem(name, data) {
                const list = read(name, []);
                const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
                list.push({ ...data, id, createdAt: Date.now() });
                return write(name, list);
            },

            setItem(name, id, data) {
                const list = read(name, []);
                const index = list.findIndex(item => item.id === id);
                if (index === -1) {
                    list.push({ createdAt: Date.now(), ...data, id });
                } else {
                    list[index] = { ...list[index], ...data };
                }
                return write(name, list);
            },

            deleteItem(name, id) {
                return write(name, read(name, []).filter(item => item.id !== id));
            },

            watchAuth(callback) {
                callback(null);
            },

            signIn() {
                return Promise.resolve();
            },

            signOut() {
                return Promise.resolve();
            }
        };
    }

    const config = window.FIREBASE_CONFIG;
    window.Store = config && typeof firebase !== 'undefined'
        ? createFirebaseStore(config)
        : createLocalStore();
})();

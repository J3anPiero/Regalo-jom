// Configuración del Mapa Interactivo (Leaflet + Nominatim), Navegación y datos compartidos
document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 🏠 SECCIÓN DE NAVEGACIÓN
    // ==========================================

    function switchSection(sectionId) {
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.add('hidden');
        });

        const activeSection = document.getElementById(sectionId);
        if (activeSection) {
            activeSection.classList.remove('hidden');
            AOS.refresh();

            if (sectionId === 'map-section') {
                // IMPORTANTE: Forzar el redimensionamiento de Leaflet al mostrar la sección
                // Esto evita que el mapa aparezca en blanco o incompleto
                setTimeout(() => {
                    if (window.myMap) {
                        window.myMap.invalidateSize();
                    }
                }, 200);
            }
        }

        document.querySelectorAll('.nav-link').forEach(link => {
            if (link.getAttribute('data-section') === sectionId) {
                link.classList.add('bg-rose-500', 'text-white', 'shadow-md');
                link.classList.remove('text-rose-600', 'hover:bg-rose-200');
            } else {
                link.classList.remove('bg-rose-500', 'text-white', 'shadow-md');
                link.classList.add('text-rose-600', 'hover:bg-rose-200');
            }
        });

        if (window.innerWidth < 768) {
            document.getElementById('sidebar').classList.add('-translate-x-full');
        }
    }

    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    if (menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('-translate-x-full');
        });
    }

    // ==========================================
    // 🧰 UTILIDADES
    // ==========================================

    const Store = window.Store;

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function showSaveError(error) {
        console.error('No se pudo guardar:', error);
        alert(Store.remote
            ? 'No se pudo guardar en la nube. Revisa tu conexión o vuelve a iniciar sesión.'
            : 'No se pudo guardar. Puede que el navegador esté lleno: prueba con fotos más pequeñas o borra alguna.');
    }

    // Reduce la foto antes de guardarla (Firestore admite hasta 1 MB por elemento)
    function fileToDataUrl(file, maxSize = 1000) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                const img = new Image();
                img.onerror = reject;
                img.onload = () => {
                    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * scale);
                    canvas.height = Math.round(img.height * scale);
                    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.75));
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // ==========================================
    // 🔐 SESIÓN (solo con Firebase)
    // ==========================================

    let currentUser = null;
    let site = {};
    let siteLoaded = false;

    const modalLogin = document.getElementById('modal-login');
    const formLogin = document.getElementById('form-login');
    const loginError = document.getElementById('login-error');
    const syncStatus = document.getElementById('sync-status');
    const btnLogout = document.getElementById('btn-logout');

    function canEdit() {
        return !Store.remote || !!currentUser;
    }

    // Devuelve true si se puede editar; si no, pide iniciar sesión
    function requireEdit() {
        if (canEdit()) return true;
        loginError.classList.add('hidden');
        modalLogin.classList.remove('hidden');
        return false;
    }

    function renderSyncStatus() {
        if (!Store.remote) {
            syncStatus.innerText = '💾 Guardado solo en este navegador';
        } else if (currentUser) {
            syncStatus.innerText = `☁️ Conectado como ${currentUser.email}`;
        } else {
            syncStatus.innerText = '☁️ Guardado en la nube';
        }
        btnLogout.classList.toggle('hidden', !currentUser);
    }

    Store.watchAuth(user => {
        currentUser = user;
        renderSyncStatus();
        if (!user && document.body.classList.contains('editing')) setEditMode(false);
        seedDefaultsIfNeeded();
        seedAlbumIfNeeded();
    });

    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        loginError.classList.add('hidden');
        try {
            await Store.signIn(
                document.getElementById('login-email').value.trim(),
                document.getElementById('login-password').value
            );
            formLogin.reset();
            modalLogin.classList.add('hidden');
        } catch (error) {
            console.error('Error al iniciar sesión:', error);
            loginError.classList.remove('hidden');
        }
    });

    document.getElementById('btn-cancel-login').addEventListener('click', () => {
        modalLogin.classList.add('hidden');
    });

    btnLogout.addEventListener('click', () => Store.signOut());

    // ==========================================
    // ⏳ SECCIÓN DEL CONTADOR DE TIEMPO
    // ==========================================

    // Fecha por defecto; se cambia desde el modo edición
    const DEFAULT_START_DATE = '2026-08-24T00:00';
    let startDate = new Date(DEFAULT_START_DATE);

    const startDateInput = document.getElementById('start-date-input');
    const startDateLabel = document.getElementById('start-date-label');

    function toInputValue(date) {
        const pad = n => String(n).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function showStartDate() {
        if (document.activeElement !== startDateInput) {
            startDateInput.value = toInputValue(startDate);
        }
        startDateLabel.innerText = 'Desde el ' + startDate.toLocaleDateString('es', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    startDateInput.addEventListener('change', () => {
        if (!startDateInput.value || !requireEdit()) return;
        Store.updateSite({ startDate: startDateInput.value }).catch(showSaveError);
    });

    function updateTimer() {
        const now = new Date();
        const diff = now - startDate;
        if (diff < 0) return;

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const seconds = Math.floor((diff / 1000) % 60);

        if(document.getElementById('days')) document.getElementById('days').innerText = days;
        if(document.getElementById('hours')) document.getElementById('hours').innerText = hours;
        if(document.getElementById('minutes')) document.getElementById('minutes').innerText = minutes;
        if(document.getElementById('seconds')) document.getElementById('seconds').innerText = seconds;
    }

    setInterval(updateTimer, 1000);

    // ==========================================
    // 🗺️ SECCIÓN DEL MAPA INTERACTIVO (LEAFLET)
    // ==========================================

    // Lugares iniciales: se guardan la primera vez y luego se pueden editar o borrar
    const DEFAULT_LOCATIONS = [
        {
            name: 'Chilokos',
            coords: [-16.3994751, -71.533432],
            description: 'Nuestra primera salida juntos. Aquí empezó todo ❤️',
            image: 'assets/img/chilokos-snack.webp'
        }
    ];

    let locations = [];
    let editingLocationId = null;

    // Inicializar Mapa de Leaflet
    // Usamos window.myMap para que sea accesible desde switchSection
    window.myMap = L.map('map', {
        scrollWheelZoom: false,
        zoomControl: true
    }).setView([-16.3994751, -71.533432], 15);

    // Esri World Street Map: no necesita API key y funciona también al abrir el archivo directamente
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri — Esri, HERE, Garmin, OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(window.myMap);

    function renderMarkers() {
        // Limpiar marcadores existentes
        window.myMap.eachLayer((layer) => {
            if (layer instanceof L.Marker) {
                window.myMap.removeLayer(layer);
            }
        });

        // Hasta que se guarden los lugares iniciales, se muestran tal cual
        const visible = site.seeded ? locations : DEFAULT_LOCATIONS;
        const markerGroup = [];

        visible.forEach(loc => {
            const marker = L.marker(loc.coords).addTo(window.myMap);
            const popupContent = `
                <div style="text-align: center; width: 200px; font-family: 'Poppins', sans-serif;">
                    ${loc.image ? `<img src="${escapeHtml(loc.image)}" style="width: 100%; border-radius: 10px; margin-bottom: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">` : ''}
                    <h4 style="margin: 0 0 5px 0; color: #e11d48; font-weight: 600;">${escapeHtml(loc.name)}</h4>
                    <p style="margin: 0; font-size: 13px; color: #4b5563; line-height: 1.4;">${escapeHtml(loc.description)}</p>
                    ${loc.id ? `
                    <div class="edit-only justify-center gap-2 mt-3">
                        <button type="button" class="loc-edit px-3 py-1 rounded-lg bg-rose-100 text-rose-600 text-xs font-semibold" data-id="${loc.id}">✏️ Editar</button>
                        <button type="button" class="loc-delete px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold" data-id="${loc.id}">🗑️ Eliminar</button>
                    </div>` : ''}
                </div>
            `;
            marker.bindPopup(popupContent);
            markerGroup.push(marker);
        });

        if (markerGroup.length > 0) {
            const group = new L.featureGroup(markerGroup);
            window.myMap.fitBounds(group.getBounds().pad(0.2), { maxZoom: 16 });
        }
    }

    Store.watchList('locations', list => {
        locations = list;
        renderMarkers();
    });

    // Guarda los lugares iniciales una sola vez (con Firebase, al iniciar sesión)
    let seeding = false;
    function seedDefaultsIfNeeded() {
        if (!siteLoaded || site.seeded || seeding || !canEdit()) return;
        seeding = true;
        Promise.all(DEFAULT_LOCATIONS.map(loc => Store.addItem('locations', loc)))
            .then(() => Store.updateSite({ seeded: true }))
            .catch(error => console.error('No se pudieron guardar los lugares iniciales:', error))
            .finally(() => { seeding = false; });
    }

    // Búsqueda de ubicación gratuita (Nominatim)
    async function searchLocation() {
        const query = document.getElementById('loc-name').value;
        if (!query) {
            alert("Por favor, escribe el nombre de un lugar.");
            return;
        }

        const btnSearch = document.getElementById('btn-search-loc');
        btnSearch.innerText = '⏳';

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);

                document.getElementById('loc-lat').value = lat.toFixed(6);
                document.getElementById('loc-lng').value = lon.toFixed(6);

                window.myMap.setView([lat, lon], 15);
                L.marker([lat, lon]).addTo(window.myMap).bindPopup(`Buscando: ${escapeHtml(result.display_name)}`).openPopup();
            } else {
                alert("No se encontró la ubicación. Intenta ser más específico.");
            }
        } catch (error) {
            console.error("Error buscando ubicación:", error);
            alert("Hubo un error al buscar la ubicación.");
        } finally {
            btnSearch.innerText = '🔍';
        }
    }

    const btnSearchLoc = document.getElementById('btn-search-loc');
    if (btnSearchLoc) {
        btnSearchLoc.addEventListener('click', searchLocation);
    }

    const modalLocation = document.getElementById('modal-location');
    const locationModalTitle = modalLocation.querySelector('h3');
    const btnAddLocation = document.getElementById('btn-add-location');
    const btnCancelLocation = document.getElementById('btn-cancel-location');
    const formLocation = document.getElementById('form-location');
    let pickingOnMap = false;

    // El modal tapa el mapa, así que lo ocultamos mientras se elige el punto
    const btnPickOnMap = document.getElementById('btn-pick-on-map');
    if (btnPickOnMap) {
        btnPickOnMap.addEventListener('click', () => {
            pickingOnMap = true;
            modalLocation.classList.add('hidden');
            document.getElementById('map').style.cursor = 'crosshair';
        });
    }

    window.myMap.on('click', (e) => {
        document.getElementById('loc-lat').value = e.latlng.lat.toFixed(6);
        document.getElementById('loc-lng').value = e.latlng.lng.toFixed(6);

        if (pickingOnMap) {
            pickingOnMap = false;
            document.getElementById('map').style.cursor = '';
            modalLocation.classList.remove('hidden');
        }
    });

    function openLocationModal(id = null) {
        if (!requireEdit()) return;
        editingLocationId = id;
        formLocation.reset();
        locationModalTitle.innerText = id ? 'Editar Lugar' : 'Nuevo Lugar Especial';

        const loc = locations.find(l => l.id === id);
        if (loc) {
            document.getElementById('loc-name').value = loc.name;
            document.getElementById('loc-lat').value = loc.coords[0];
            document.getElementById('loc-lng').value = loc.coords[1];
            document.getElementById('loc-desc').value = loc.description;
            document.getElementById('loc-img').value = loc.image && !loc.image.startsWith('data:') ? loc.image : '';
        }
        modalLocation.classList.remove('hidden');
    }

    if (btnAddLocation) {
        btnAddLocation.addEventListener('click', () => openLocationModal());
    }

    if (btnCancelLocation) {
        btnCancelLocation.addEventListener('click', () => {
            pickingOnMap = false;
            modalLocation.classList.add('hidden');
        });
    }

    // Botones de Editar/Eliminar dentro de la ventanita de cada lugar
    window.myMap.on('popupopen', (e) => {
        const popupEl = e.popup.getElement();
        popupEl.querySelector('.loc-edit')?.addEventListener('click', (ev) => {
            window.myMap.closePopup();
            openLocationModal(ev.currentTarget.getAttribute('data-id'));
        });
        popupEl.querySelector('.loc-delete')?.addEventListener('click', (ev) => {
            if (!requireEdit()) return;
            const loc = locations.find(l => l.id === ev.currentTarget.getAttribute('data-id'));
            if (!loc || !confirm(`¿Eliminar "${loc.name}" del mapa?`)) return;
            Store.deleteItem('locations', loc.id).catch(showSaveError);
        });
    });

    if (formLocation) {
        formLocation.addEventListener('submit', async (e) => {
            e.preventDefault();

            const imageInput = document.getElementById('loc-img').value;
            const previous = locations.find(l => l.id === editingLocationId);

            const newLoc = {
                name: document.getElementById('loc-name').value,
                coords: [
                    parseFloat(document.getElementById('loc-lat').value),
                    parseFloat(document.getElementById('loc-lng').value)
                ],
                description: document.getElementById('loc-desc').value,
                // Si al editar se deja vacío, se conserva la foto anterior
                image: imageInput || (previous ? previous.image : '')
            };

            try {
                if (previous) {
                    await Store.setItem('locations', previous.id, newLoc);
                } else {
                    await Store.addItem('locations', newLoc);
                }
            } catch (error) {
                showSaveError(error);
                return;
            }

            editingLocationId = null;
            formLocation.reset();
            modalLocation.classList.add('hidden');
        });
    }

    // ==========================================
    // 📸 SECCIÓN MOMENTOS FELICES (SALIDAS CON FOTOS)
    // ==========================================

    // Primera salida: se guarda una sola vez y luego se puede editar o borrar
    const DEFAULT_ALBUM = {
        title: 'Chilokos',
        photos: [
            { oldId: 'chilokos-snack', textKey: 'photo-1-caption', src: 'assets/img/chilokos-snack.webp', caption: 'Nuestro snack preparado' },
            { oldId: 'chilokos-bebida-morada', textKey: 'photo-2-caption', src: 'assets/img/chilokos-bebida-morada.webp', caption: 'La bebida morada' },
            { oldId: 'chilokos-bebida-canela', textKey: 'photo-3-caption', src: 'assets/img/chilokos-bebida-canela.webp', caption: 'La bebida con canela' }
        ]
    };

    let albums = [];
    let albumPhotos = [];
    let pendingAlbumRender = false;

    const albumsList = document.getElementById('albums-list');
    const albumsEmpty = document.getElementById('albums-empty');
    const modalAlbum = document.getElementById('modal-album');
    const formAlbum = document.getElementById('form-album');
    const btnSaveAlbum = document.getElementById('btn-save-album');
    const albumAddPhotosInput = document.getElementById('album-add-photos-input');
    let albumToAddPhotos = null;

    function starsHtml(photo) {
        const current = photo.rating || 0;
        return `
            <div class="flex justify-center gap-1 mt-2">
                ${[1, 2, 3, 4, 5].map(n => `
                    <button type="button" class="star-btn ${n <= current ? 'active' : ''}" data-photo-id="${photo.id}" data-value="${n}" aria-label="${n} estrella${n > 1 ? 's' : ''}">★</button>
                `).join('')}
            </div>
            <p class="text-center text-sm text-gray-500 mt-1">
                ${current ? `Puntuación: ${current}/5` : 'Sin puntuar'}
            </p>
        `;
    }

    function renderAlbums() {
        // No redibujar mientras alguien escribe un título o pie de foto
        if (albumsList.contains(document.activeElement)) {
            pendingAlbumRender = true;
            return;
        }

        // Hasta que se guarde la primera salida, se muestra tal cual (sin editar)
        const visibleAlbums = site.albumsSeeded
            ? albums
            : [{ id: null, title: DEFAULT_ALBUM.title }];
        const photosOf = album => album.id
            ? albumPhotos.filter(p => p.albumId === album.id)
            : DEFAULT_ALBUM.photos.map(p => ({ ...p, id: null, rating: (site.ratings || {})[p.oldId] || 0 }));
        const editing = document.body.classList.contains('editing') ? 'true' : 'false';

        albumsEmpty.classList.toggle('hidden', visibleAlbums.length > 0);

        albumsList.innerHTML = visibleAlbums.map(album => {
            const photos = photosOf(album);
            return `
                <div>
                    <div class="flex flex-col items-center mb-8">
                        <h3 class="inline-edit album-title text-4xl font-romantic text-rose-600 text-center px-2" data-album-id="${album.id || ''}" contenteditable="${album.id ? editing : 'false'}">${escapeHtml(album.title)}</h3>
                        <div class="w-24 h-1 bg-rose-300 rounded-full mt-3"></div>
                        ${album.id ? `
                        <div class="edit-only flex-wrap justify-center gap-2 mt-4">
                            <button type="button" class="album-add-photos px-4 py-2 rounded-xl bg-rose-100 text-rose-600 text-sm font-semibold hover:bg-rose-200" data-album-id="${album.id}">📷 Agregar fotos</button>
                            <button type="button" class="album-delete px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200" data-album-id="${album.id}">🗑️ Eliminar salida</button>
                        </div>` : ''}
                    </div>
                    ${photos.length === 0 ? `
                        <p class="text-center text-gray-400 italic">Todavía no hay fotos de esta salida.</p>
                    ` : `
                    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
                        ${photos.map(photo => `
                            <div class="polaroid">
                                <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.caption || album.title)}" class="w-full h-64 object-cover mb-4">
                                <p class="inline-edit photo-caption font-romantic text-center text-xl text-gray-700 min-h-[1.75rem]" data-photo-id="${photo.id || ''}" contenteditable="${photo.id ? editing : 'false'}">${escapeHtml(photo.caption)}</p>
                                ${starsHtml(photo)}
                                ${photo.id ? `
                                <div class="edit-only justify-center mt-3">
                                    <button type="button" class="photo-delete px-3 py-1 rounded-lg bg-gray-100 text-gray-600 text-xs font-semibold hover:bg-gray-200" data-photo-id="${photo.id}">🗑️ Quitar foto</button>
                                </div>` : ''}
                            </div>
                        `).join('')}
                    </div>`}
                </div>
            `;
        }).join('');
    }

    // Guarda la salida de Chilokos y pasa sus puntuaciones y pies de foto anteriores
    let seedingAlbums = false;
    async function seedAlbumIfNeeded() {
        if (!siteLoaded || site.albumsSeeded || seedingAlbums || !canEdit()) return;
        seedingAlbums = true;
        try {
            const { id: albumId } = await Store.addItem('albums', { title: DEFAULT_ALBUM.title });
            for (const photo of DEFAULT_ALBUM.photos) {
                await Store.addItem('albumPhotos', {
                    albumId,
                    src: photo.src,
                    caption: (site.texts || {})[photo.textKey] ?? photo.caption,
                    rating: (site.ratings || {})[photo.oldId] || 0
                });
            }
            await Store.updateSite({ albumsSeeded: true });
        } catch (error) {
            console.error('No se pudo guardar la primera salida:', error);
        } finally {
            seedingAlbums = false;
        }
    }

    async function addPhotosToAlbum(albumId, files, button) {
        const label = button.innerText;
        button.disabled = true;
        try {
            for (let i = 0; i < files.length; i++) {
                button.innerText = `⏳ ${i + 1}/${files.length}`;
                const src = await fileToDataUrl(files[i]);
                await Store.addItem('albumPhotos', { albumId, src, caption: '', rating: 0 });
            }
        } finally {
            button.innerText = label;
            button.disabled = false;
        }
    }

    // Clics dentro de las salidas: estrellas y botones de edición
    albumsList.addEventListener('click', (e) => {
        const star = e.target.closest('.star-btn');
        if (star) {
            const photoId = star.getAttribute('data-photo-id');
            if (!photoId || !requireEdit()) return;
            const photo = albumPhotos.find(p => p.id === photoId);
            const value = parseInt(star.getAttribute('data-value'), 10);
            // Pulsar la misma estrella otra vez quita la puntuación
            Store.setItem('albumPhotos', photoId, { rating: photo.rating === value ? 0 : value })
                .catch(showSaveError);
            return;
        }

        const addBtn = e.target.closest('.album-add-photos');
        if (addBtn) {
            if (!requireEdit()) return;
            albumToAddPhotos = addBtn;
            albumAddPhotosInput.value = '';
            albumAddPhotosInput.click();
            return;
        }

        const deleteAlbumBtn = e.target.closest('.album-delete');
        if (deleteAlbumBtn) {
            if (!requireEdit()) return;
            const albumId = deleteAlbumBtn.getAttribute('data-album-id');
            const album = albums.find(a => a.id === albumId);
            if (!album || !confirm(`¿Eliminar la salida "${album.title}" y todas sus fotos?`)) return;
            Promise.all(albumPhotos.filter(p => p.albumId === albumId).map(p => Store.deleteItem('albumPhotos', p.id)))
                .then(() => Store.deleteItem('albums', albumId))
                .catch(showSaveError);
            return;
        }

        const deletePhotoBtn = e.target.closest('.photo-delete');
        if (deletePhotoBtn) {
            if (!requireEdit() || !confirm('¿Quitar esta foto?')) return;
            Store.deleteItem('albumPhotos', deletePhotoBtn.getAttribute('data-photo-id')).catch(showSaveError);
        }
    });

    // Al terminar de escribir un título o pie de foto, se guarda
    albumsList.addEventListener('focusout', (e) => {
        const title = e.target.closest('.album-title');
        const caption = e.target.closest('.photo-caption');

        if (title && title.getAttribute('data-album-id')) {
            const albumId = title.getAttribute('data-album-id');
            const value = title.textContent.trim();
            const album = albums.find(a => a.id === albumId);
            if (album && value && value !== album.title) {
                Store.setItem('albums', albumId, { title: value }).catch(showSaveError);
            }
        }

        if (caption && caption.getAttribute('data-photo-id')) {
            const photoId = caption.getAttribute('data-photo-id');
            const value = caption.textContent.trim();
            const photo = albumPhotos.find(p => p.id === photoId);
            if (photo && value !== (photo.caption || '')) {
                Store.setItem('albumPhotos', photoId, { caption: value }).catch(showSaveError);
            }
        }

        // Si llegaron cambios mientras se escribía, dibujarlos ahora
        setTimeout(() => {
            if (pendingAlbumRender && !albumsList.contains(document.activeElement)) {
                pendingAlbumRender = false;
                renderAlbums();
            }
        }, 0);
    });

    // Enter en un título o pie de foto termina la edición en vez de saltar de línea
    albumsList.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.closest('.inline-edit')) {
            e.preventDefault();
            e.target.blur();
        }
    });

    albumAddPhotosInput.addEventListener('change', () => {
        const files = [...albumAddPhotosInput.files];
        if (!files.length || !albumToAddPhotos) return;
        addPhotosToAlbum(albumToAddPhotos.getAttribute('data-album-id'), files, albumToAddPhotos)
            .catch(showSaveError);
    });

    document.getElementById('btn-add-album').addEventListener('click', () => {
        if (!requireEdit()) return;
        formAlbum.reset();
        modalAlbum.classList.remove('hidden');
    });

    document.getElementById('btn-cancel-album').addEventListener('click', () => {
        modalAlbum.classList.add('hidden');
    });

    formAlbum.addEventListener('submit', async (e) => {
        e.preventDefault();
        const files = [...document.getElementById('album-photos').files];

        btnSaveAlbum.disabled = true;
        btnSaveAlbum.innerText = '⏳';
        try {
            const { id } = await Store.addItem('albums', {
                title: document.getElementById('album-title').value.trim()
            });
            await addPhotosToAlbum(id, files, btnSaveAlbum);
            formAlbum.reset();
            modalAlbum.classList.add('hidden');
        } catch (error) {
            showSaveError(error);
        } finally {
            btnSaveAlbum.disabled = false;
            btnSaveAlbum.innerText = 'Guardar ❤️';
        }
    });

    Store.watchList('albums', list => {
        albums = list;
        renderAlbums();
    });

    Store.watchList('albumPhotos', list => {
        albumPhotos = list;
        renderAlbums();
    });

    // ==========================================
    // 📖 SECCIÓN DE HISTORIAS
    // ==========================================

    let stories = [];
    let editingStoryId = null;

    const storiesList = document.getElementById('stories-list');
    const storiesEmpty = document.getElementById('stories-empty');
    const modalStory = document.getElementById('modal-story');
    const formStory = document.getElementById('form-story');
    const storyModalTitle = document.getElementById('story-modal-title');
    const btnSaveStory = document.getElementById('btn-save-story');

    function renderStories() {
        storiesEmpty.classList.toggle('hidden', stories.length > 0);
        storiesList.classList.toggle('hidden', stories.length === 0);

        storiesList.innerHTML = stories.map((story, i) => `
            <div class="timeline-item relative" data-aos="${i % 2 === 0 ? 'fade-left' : 'fade-right'}">
                <div class="bg-white p-6 rounded-2xl shadow-md hover:shadow-lg transition-shadow">
                    ${story.tag ? `<span class="text-rose-400 font-bold text-sm uppercase tracking-wider">${escapeHtml(story.tag)}</span>` : ''}
                    <h3 class="text-2xl font-semibold text-gray-700 mb-2">${escapeHtml(story.title)}</h3>
                    <p class="text-gray-600 leading-relaxed whitespace-pre-line">${escapeHtml(story.text)}</p>
                    ${story.image ? `<img src="${escapeHtml(story.image)}" alt="${escapeHtml(story.title)}" class="mt-4 rounded-lg w-full h-48 object-cover shadow-inner">` : ''}
                    <div class="edit-only gap-2 mt-4">
                        <button type="button" class="story-edit px-4 py-2 rounded-xl bg-rose-100 text-rose-600 text-sm font-semibold hover:bg-rose-200" data-id="${story.id}">✏️ Editar</button>
                        <button type="button" class="story-delete px-4 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200" data-id="${story.id}">🗑️ Eliminar</button>
                    </div>
                </div>
            </div>
        `).join('');

        storiesList.querySelectorAll('.story-edit').forEach(btn => {
            btn.addEventListener('click', () => openStoryModal(btn.getAttribute('data-id')));
        });
        storiesList.querySelectorAll('.story-delete').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!requireEdit()) return;
                const story = stories.find(s => s.id === btn.getAttribute('data-id'));
                if (!story || !confirm(`¿Eliminar la historia "${story.title}"?`)) return;
                Store.deleteItem('stories', story.id).catch(showSaveError);
            });
        });

        // refreshHard registra también las tarjetas recién creadas
        AOS.refreshHard();
    }

    function openStoryModal(id = null) {
        if (!requireEdit()) return;
        editingStoryId = id;
        formStory.reset();
        storyModalTitle.innerText = id ? 'Editar Historia' : 'Nueva Historia';

        const story = stories.find(s => s.id === id);
        if (story) {
            document.getElementById('story-tag').value = story.tag;
            document.getElementById('story-title').value = story.title;
            document.getElementById('story-text').value = story.text;
        }
        modalStory.classList.remove('hidden');
    }

    document.getElementById('btn-add-story').addEventListener('click', () => openStoryModal());
    document.getElementById('btn-cancel-story').addEventListener('click', () => {
        modalStory.classList.add('hidden');
    });

    formStory.addEventListener('submit', async (e) => {
        e.preventDefault();

        const file = document.getElementById('story-img').files[0];
        const previous = stories.find(s => s.id === editingStoryId);
        let image = previous ? previous.image : '';

        btnSaveStory.innerText = '⏳';
        btnSaveStory.disabled = true;

        try {
            if (file) image = await fileToDataUrl(file);

            const story = {
                tag: document.getElementById('story-tag').value.trim(),
                title: document.getElementById('story-title').value.trim(),
                text: document.getElementById('story-text').value.trim(),
                image
            };

            if (previous) {
                await Store.setItem('stories', previous.id, story);
            } else {
                await Store.addItem('stories', story);
            }

            editingStoryId = null;
            formStory.reset();
            modalStory.classList.add('hidden');
        } catch (error) {
            showSaveError(error);
        } finally {
            btnSaveStory.innerText = 'Guardar ❤️';
            btnSaveStory.disabled = false;
        }
    });

    Store.watchList('stories', list => {
        stories = list;
        renderStories();
    });

    // ==========================================
    // ✏️ MODO EDICIÓN (TEXTOS Y FOTOS)
    // ==========================================

    const editables = document.querySelectorAll('[data-editable]');
    const btnEditMode = document.getElementById('btn-edit-mode');
    const editBanner = document.getElementById('edit-banner');
    const defaultTexts = {};
    const saveTimers = {};

    editables.forEach(el => {
        const key = el.getAttribute('data-editable');
        // Quitar la sangría del HTML para que no se vea como saltos de línea
        defaultTexts[key] = el.textContent.replace(/\s+/g, ' ').trim();

        // Se guarda medio segundo después de dejar de escribir.
        // innerText conserva los saltos de línea hechos con Enter.
        el.addEventListener('input', () => {
            clearTimeout(saveTimers[key]);
            saveTimers[key] = setTimeout(() => {
                const value = el.innerText.trim();
                el.dataset.shown = value;
                Store.updateSite({ texts: { [key]: value } }).catch(showSaveError);
            }, 600);
        });
    });

    function applyTexts() {
        const texts = site.texts || {};
        editables.forEach(el => {
            // No pisar lo que alguien está escribiendo en este momento
            if (document.activeElement === el) return;
            const key = el.getAttribute('data-editable');
            const value = (texts[key] ?? defaultTexts[key]).trim();
            if (el.dataset.shown !== value) {
                el.textContent = value;
                el.dataset.shown = value;
            }
        });
    }

    function setEditMode(editing) {
        document.body.classList.toggle('editing', editing);
        editables.forEach(el => {
            el.contentEditable = editing ? 'true' : 'false';
        });
        btnEditMode.innerText = editing ? '✅ Terminar' : '✏️ Modo edición';
        btnEditMode.classList.toggle('bg-rose-500', editing);
        btnEditMode.classList.toggle('text-white', editing);
        editBanner.classList.toggle('hidden', !editing);
        // Títulos y pies de foto de las salidas se vuelven editables
        renderAlbums();
    }

    btnEditMode.addEventListener('click', () => {
        const editing = !document.body.classList.contains('editing');
        if (editing && !requireEdit()) return;
        setEditMode(editing);
    });

    // ==========================================
    // 🔄 DATOS GENERALES (fecha, textos, puntuaciones)
    // ==========================================

    Store.watchSite(data => {
        site = data;
        siteLoaded = true;

        startDate = new Date(site.startDate || DEFAULT_START_DATE);
        showStartDate();
        updateTimer();
        applyTexts();
        renderAlbums();
        renderMarkers();
        seedDefaultsIfNeeded();
        seedAlbumIfNeeded();
    });

    renderSyncStatus();

    window.switchSection = switchSection;
});

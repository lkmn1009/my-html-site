document.addEventListener('DOMContentLoaded', () => {
    // --- Global State ---
    const state = {
        slideIndexes: {},
        currentAudioPlayer: null,
        youtubePlayer: null,
        youtubeAPIReady: false,
        isAudioPlaying: false,
        progressInterval: null,
        currentVolume: 0.7,
        activeCategory: null,
        activeSubcategory: null,
        activePlaylist: 'latestUpload', // Default active music playlist
        isDragging: false,
        dragStartX: 0,
        dragScrollLeft: 0,
        currentMediaType: null,
        currentPlayingThumbnail: null,
        queuedYouTubeVideoId: null,
        lastVolumeBeforeMute: 0.7,
        slideshowSwipeStartX: 0,
        isSlideshowSwiping: false,
        swipeThreshold: 75
    };

    // --- Cached Elements ---
    const elements = {
        categoryNavButtons: document.querySelectorAll('.category-nav__button'),
        categoryContents: document.querySelectorAll('.category-content'),
        subcategoryNavs: document.querySelectorAll('.subcategory-nav'),
        slideshows: document.querySelectorAll('.slideshow'),
        videoPromoSections: document.querySelectorAll('.slideshow-section--video-promo'),
        musicNavButtons: document.querySelectorAll('.music-nav button'), // More specific selector
        musicPlaylists: document.querySelectorAll('.music-playlist'),
        musicThumbnailsContainers: document.querySelectorAll('.music-thumbnails-container'),
        globalAudioPlayer: document.getElementById('globalAudioPlayer'),
    };

    if (elements.globalAudioPlayer) {
        state.currentAudioPlayer = elements.globalAudioPlayer;
    } else {
        console.error("Global audio player element not found!");
    }

    // --- Helper Functions ---
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    const extractYouTubeId = (urlOrId) => {
        if (!urlOrId || typeof urlOrId !== 'string') return null;
        if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;
        try {
            const url = new URL(urlOrId);
            if (url.hostname === 'www.youtube.com' || url.hostname === 'm.youtube.com' || url.hostname === 'youtube.com') {
                if (url.pathname === '/watch') return url.searchParams.get('v');
                if (url.pathname.startsWith('/embed/')) return url.pathname.split('/embed/')[1].split('?')[0];
                if (url.pathname.startsWith('/v/')) return url.pathname.split('/v/')[1].split('?')[0];
                if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/shorts/')[1].split('?')[0];
            } else if (url.hostname === 'youtu.be') {
                return url.pathname.slice(1).split('?')[0];
            }
        } catch (e) { /* Invalid URL or other parsing error */ }
        return null;
    };

    const stopProgressTimer = () => {
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
    };

    const togglePlayPauseButtons = (isPlaying) => {
        const musicContentActive = state.activeCategory === 'MusicContent';
        const activePlaylistElement = musicContentActive ? document.querySelector(`#MusicContent .music-playlist[id="${state.activePlaylist}"].active`) : null;

        if (!activePlaylistElement) { // If no specific playlist is active, reset all
            elements.musicPlaylists.forEach(playlist => {
                const playBtn = playlist.querySelector('.play-button');
                const pauseBtn = playlist.querySelector('.pause-button');
                if (playBtn && pauseBtn) {
                    playBtn.hidden = false;
                    pauseBtn.hidden = true;
                    playBtn.setAttribute('aria-label', 'Play');
                }
            });
            return;
        }

        const playButton = activePlaylistElement.querySelector('.play-button');
        const pauseButton = activePlaylistElement.querySelector('.pause-button');

        if (playButton && pauseButton) {
            playButton.hidden = isPlaying;
            pauseButton.hidden = !isPlaying;
            playButton.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play'); // Corrected aria-label for play
            pauseButton.setAttribute('aria-label', 'Pause');
        }
    };

    const updatePlayerDisplayForPlaylist = (playlistElement, cover, title, artist, currentTime = 0, duration = 0, progress = 0) => {
        if (!playlistElement) return;
        const coverImg = playlistElement.querySelector('.music-cover__img');
        const titleEl = playlistElement.querySelector('.music-title');
        const artistEl = playlistElement.querySelector('.music-artist');
        const progressBarEl = playlistElement.querySelector('.progress-bar');
        const timeCurrentEl = playlistElement.querySelector('.time-current');
        const timeDurationEl = playlistElement.querySelector('.time-duration');

        if (coverImg) coverImg.src = cover || 'Img/Foto Profil.png'; // Default cover
        if (titleEl) titleEl.textContent = title || 'Unknown Title';
        if (artistEl) artistEl.textContent = artist || 'Unknown Artist';
        if (progressBarEl) progressBarEl.value = isNaN(progress) ? 0 : progress;
        if (timeCurrentEl) timeCurrentEl.textContent = formatTime(isNaN(currentTime) ? 0 : currentTime);
        if (timeDurationEl) timeDurationEl.textContent = formatTime(isNaN(duration) ? 0 : duration);
    };

    const setActiveMusicTrackUI = (thumbnailToActivate, mediaType, targetPlaylistElementForDisplay) => {
        if (!thumbnailToActivate) return;

        state.currentMediaType = mediaType;
        state.currentPlayingThumbnail = thumbnailToActivate;

        // Deactivate thumbnails in all playlists first
        elements.musicPlaylists.forEach(pl => {
            pl.querySelectorAll('.music-thumbnail:not([href])').forEach(t => {
                t.classList.remove('active');
                t.setAttribute('aria-selected', 'false');
            });
        });

        // Activate the target thumbnail
        thumbnailToActivate.classList.add('active');
        thumbnailToActivate.setAttribute('aria-selected', 'true');

        const cover = thumbnailToActivate.dataset.cover;
        const title = thumbnailToActivate.dataset.title;
        const artist = thumbnailToActivate.dataset.artist;
        updatePlayerDisplayForPlaylist(targetPlaylistElementForDisplay, cover, title, artist, 0, 0, 0);

        const thumbnailContainer = thumbnailToActivate.closest('.music-thumbnails-container');
        const thumbnailPlaylist = thumbnailToActivate.closest('.music-playlist');
        if (thumbnailContainer && thumbnailPlaylist && thumbnailPlaylist.classList.contains('active')) {
            centerMusicThumbnail(thumbnailContainer, thumbnailToActivate);
        }
    };


    const stopCurrentMusicPlayback = (clearAllDisplays = true) => { // Default to clear displays
        if (state.currentAudioPlayer && !state.currentAudioPlayer.paused) {
            state.currentAudioPlayer.pause();
            if (clearAllDisplays) state.currentAudioPlayer.currentTime = 0; // Only reset time if clearing all
        }

        if (state.youtubePlayer && typeof state.youtubePlayer.stopVideo === 'function' && typeof state.youtubePlayer.getPlayerState === 'function') {
            const playerState = state.youtubePlayer.getPlayerState();
            if (typeof YT !== 'undefined' && YT && typeof YT.PlayerState === 'object') {
                if ([YT.PlayerState.PLAYING, YT.PlayerState.BUFFERING, YT.PlayerState.PAUSED].includes(playerState)) {
                    state.youtubePlayer.stopVideo();
                }
            } else if (playerState === 1 || playerState === 3 || playerState === 2) {
                state.youtubePlayer.stopVideo();
            }
        }

        stopProgressTimer();
        state.isAudioPlaying = false;
        togglePlayPauseButtons(false); // Update buttons globally based on new state

        if (state.currentPlayingThumbnail) {
            state.currentPlayingThumbnail.classList.remove('active');
            state.currentPlayingThumbnail.setAttribute('aria-selected', 'false');
        }

        if (clearAllDisplays) {
            state.currentPlayingThumbnail = null;
            state.currentMediaType = null;
            elements.musicPlaylists.forEach(pl => {
                const firstThumb = pl.querySelector('.music-thumbnail:not([href])');
                if (firstThumb) {
                    updatePlayerDisplayForPlaylist(pl, firstThumb.dataset.cover, firstThumb.dataset.title, firstThumb.dataset.artist);
                } else {
                    updatePlayerDisplayForPlaylist(pl, null, 'No songs available', '');
                }
            });
        }
    };

    const stopAllMedia = (keepAudioIfInMusicContent = false) => {
        const isInMusicContent = state.activeCategory === 'MusicContent';

        document.querySelectorAll('video.video-promo__player, .slideshow video').forEach(video => {
            if (!video.paused) {
                video.pause();
                const slideItem = video.closest('.slideshow__item');
                const playButton = slideItem?.querySelector('.slideshow__play-button');
                if (playButton) {
                    playButton.classList.remove('hidden');
                    playButton.setAttribute('aria-label', 'Play Video');
                }
            }
        });

        document.querySelectorAll('.video-promo__player-wrapper .youtube-iframe').forEach(iframe => {
            if (iframe.src && (iframe.src.includes('youtube.com/embed') || iframe.src.includes('youtu.be'))) {
                iframe.src = 'about:blank';
            }
        });

        if (!keepAudioIfInMusicContent || !isInMusicContent) {
            stopCurrentMusicPlayback(true); // Clear displays if not keeping audio for music content
        } else if (isInMusicContent && !keepAudioIfInMusicContent) {
             // If in music content but explicitly told not to keep audio (e.g. switching main category)
            stopCurrentMusicPlayback(true);
        }
        // If keepAudioIfInMusicContent is true AND isInMusicContent is true, music playback state is preserved.
    };

    const hideAllContent = () => {
        elements.categoryContents.forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
            content.setAttribute('aria-hidden', 'true');
            content.querySelectorAll('.slideshow-section, .sub_menu > .slideshow-section').forEach(subContent => {
                subContent.style.display = 'none';
                subContent.classList.remove('active');
                subContent.hidden = true;
            });
        });
        elements.categoryNavButtons.forEach(button => {
            button.classList.remove('active');
            button.setAttribute('aria-expanded', 'false');
        });
        elements.subcategoryNavs.forEach(nav => {
            nav.querySelectorAll('button').forEach(button => {
                button.classList.remove('active');
                button.setAttribute('aria-current', 'false');
            });
        });
    };

    const showCategoryContent = (contentId) => {
        const isSwitchingToMusicContent = contentId === 'MusicContent';
        const wasInMusicContent = state.activeCategory === 'MusicContent';

        if (state.activeCategory !== contentId) { // Only stop all media if switching main categories
            stopAllMedia(isSwitchingToMusicContent); // Keep audio if switching TO music content
        }

        hideAllContent();

        const targetContent = document.getElementById(contentId);
        if (!targetContent) {
            console.error(`Target content with ID "${contentId}" not found.`);
            state.activeCategory = null;
            if (wasInMusicContent && !isSwitchingToMusicContent) togglePlayPauseButtons(false); // Reset music buttons if leaving music
            return;
        }

        targetContent.style.display = 'block';
        targetContent.classList.add('active');
        targetContent.setAttribute('aria-hidden', 'false');
        state.activeCategory = contentId;

        const activeButton = document.querySelector(`.category-nav__button[data-dropdown-target="${contentId}"]`);
        if (activeButton) {
            activeButton.classList.add('active');
            activeButton.setAttribute('aria-expanded', 'true');
        }

        if (isSwitchingToMusicContent) {
            const activePlaylistId = state.activePlaylist; // Use the stored active playlist
            const activePlaylistElement = document.getElementById(activePlaylistId);

            elements.musicPlaylists.forEach(pl => {
                const isActive = pl.id === activePlaylistId;
                pl.style.display = isActive ? 'block' : 'none';
                pl.classList.toggle('active', isActive);
                pl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            });
            
            elements.musicNavButtons.forEach(btn => {
                 btn.classList.toggle('active', btn.dataset.musicTarget === activePlaylistId);
                 btn.setAttribute('aria-current', btn.dataset.musicTarget === activePlaylistId ? 'page' : 'false');
            });


            if (activePlaylistElement) {
                if (state.isAudioPlaying && state.currentPlayingThumbnail) {
                    const songData = {
                        cover: state.currentPlayingThumbnail.dataset.cover,
                        title: state.currentPlayingThumbnail.dataset.title,
                        artist: state.currentPlayingThumbnail.dataset.artist,
                        currentTime: 0, duration: 0, progress: 0,
                    };

                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                        songData.currentTime = state.currentAudioPlayer.currentTime;
                        songData.duration = state.currentAudioPlayer.duration || 0;
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.getDuration) {
                        songData.duration = state.youtubePlayer.getDuration() || 0;
                        songData.currentTime = state.youtubePlayer.getCurrentTime() || 0;
                    }
                    songData.progress = songData.duration && songData.duration > 0 ? (songData.currentTime / songData.duration) * 100 : 0;

                    updatePlayerDisplayForPlaylist(activePlaylistElement, songData.cover, songData.title, songData.artist, songData.currentTime, songData.duration, songData.progress);
                    
                    // Sync active thumbnail within this playlist
                    const currentGlobalThumbSrc = state.currentPlayingThumbnail.dataset.musicSrc;
                    const currentGlobalThumbYT = state.currentPlayingThumbnail.dataset.youtubeId ? extractYouTubeId(state.currentPlayingThumbnail.dataset.youtubeId) : null;

                    activePlaylistElement.querySelectorAll('.music-thumbnail:not([href])').forEach(t => {
                        const tSrc = t.dataset.musicSrc;
                        const tYT = t.dataset.youtubeId ? extractYouTubeId(t.dataset.youtubeId) : null;
                        const isThisThePlayingThumb = (state.currentMediaType === 'audio' && tSrc === currentGlobalThumbSrc) ||
                                                     (state.currentMediaType === 'youtube' && tYT && tYT === currentGlobalThumbYT);
                        t.classList.toggle('active', isThisThePlayingThumb);
                        t.setAttribute('aria-selected', isThisThePlayingThumb ? 'true' : 'false');
                        if(isThisThePlayingThumb) {
                             centerMusicThumbnail(t.closest('.music-thumbnails-container'), t);
                        }
                    });


                    if (state.isAudioPlaying) {
                        const progressBar = activePlaylistElement.querySelector('.progress-bar');
                        const timeCurrent = activePlaylistElement.querySelector('.time-current');
                        const playerInstance = state.currentMediaType === 'audio' ? state.currentAudioPlayer : state.youtubePlayer;
                        if (playerInstance) startProgressTimer(playerInstance, progressBar, timeCurrent);
                    }
                } else { // Not playing or no current thumbnail
                    const firstThumb = activePlaylistElement.querySelector('.music-thumbnail:not([href])');
                    if (firstThumb) {
                        updatePlayerDisplayForPlaylist(activePlaylistElement, firstThumb.dataset.cover, firstThumb.dataset.title, firstThumb.dataset.artist);
                    } else {
                        updatePlayerDisplayForPlaylist(activePlaylistElement, null, 'No songs available', '');
                    }
                    activePlaylistElement.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => {
                        t.classList.remove('active');
                        t.setAttribute('aria-selected', 'false');
                    });
                }
            }
            togglePlayPauseButtons(state.isAudioPlaying); // Update for current global state
        } else { // Not MusicContent
            const firstSubButton = targetContent.querySelector('.subcategory-nav button'); // More specific
            if (firstSubButton) firstSubButton.click();
            if (wasInMusicContent) togglePlayPauseButtons(false); // Reset music buttons if leaving music
        }
    };

    const showSubContent = (subContentId) => {
        const parentContent = document.querySelector('.category-content.active');
        if (!parentContent || parentContent.id === "MusicContent") return;

        stopAllMedia(parentContent.id === 'MusicContent'); // Keep audio only if already in music content (which is not this branch)

        parentContent.querySelectorAll('.slideshow-section, .sub_menu > .slideshow-section').forEach(section => {
            section.style.display = 'none';
            section.classList.remove('active');
            section.hidden = true;
        });

        const targetSubContent = document.getElementById(subContentId);
        if (targetSubContent) {
            targetSubContent.style.display = 'block';
            targetSubContent.classList.add('active');
            targetSubContent.hidden = false;
            state.activeSubcategory = subContentId;

            if (targetSubContent.classList.contains('slideshow-section--video-promo')) {
                const firstThumb = targetSubContent.querySelector('.video-promo__thumbnail');
                if (firstThumb) handleVideoThumbnailClick(firstThumb, targetSubContent);
            } else {
                const container = targetSubContent.querySelector('.slideshow__container');
                if (container) initializeSlides(container);
            }
        } else {
            console.error(`Target subcontent with ID "${subContentId}" not found.`);
            state.activeSubcategory = null;
        }
    };

    const initializeSlides = (slideshowContainer) => {
        if (!slideshowContainer) return;
        const category = slideshowContainer.dataset.category;
        if (!category) return;

        const slides = slideshowContainer.querySelectorAll(':scope > .slideshow__item');
        if (slides.length === 0) return;

        slides.forEach(slide => {
            slide.style.display = "none";
            slide.classList.remove('active');
        });

        let currentIndex = state.slideIndexes[category] ?? 0;
        currentIndex = Math.max(0, Math.min(currentIndex, slides.length - 1));
        state.slideIndexes[category] = currentIndex;

        if (slides[currentIndex]) {
            slides[currentIndex].style.display = "flex";
            slides[currentIndex].classList.add('active');
            const video = slides[currentIndex].querySelector('video');
            const playButton = slides[currentIndex].querySelector('.slideshow__play-button');
            if (video && playButton) {
                playButton.classList.toggle('hidden', !video.paused);
                playButton.setAttribute('aria-label', video.paused ? 'Play Video' : 'Pause Video');
            }
        }
        initializeDots(slideshowContainer.closest('.slideshow'));
    };

    const initializeDots = (slideshowElement) => {
        if (!slideshowElement) return;
        const container = slideshowElement.querySelector('.slideshow__container');
        const paginationContainer = slideshowElement.querySelector('.slideshow__pagination');
        if (!container || !paginationContainer) return;

        const category = container.dataset.category;
        const slides = container.querySelectorAll(':scope > .slideshow__item');
        const activeIndex = state.slideIndexes[category] ?? 0;

        paginationContainer.innerHTML = '';
        slides.forEach((_, index) => {
            const dot = document.createElement('button');
            dot.className = 'dot';
            dot.setAttribute('aria-label', `Go to slide ${index + 1}`);
            if (index === activeIndex) {
                dot.classList.add('active');
                dot.setAttribute('aria-current', 'true');
            }
            dot.addEventListener('click', () => showSlide(category, index));
            paginationContainer.appendChild(dot);
        });
    };

    const showSlide = (category, index) => {
        const container = document.querySelector(`.slideshow__container[data-category="${category}"]`);
        if (!container) return;
        const slides = container.querySelectorAll(':scope > .slideshow__item');
        if (index < 0 || index >= slides.length || slides.length === 0) return;

        const currentActiveSlide = container.querySelector(':scope > .slideshow__item.active');
        if (currentActiveSlide) {
            const video = currentActiveSlide.querySelector('video');
            if (video && !video.paused) video.pause();
            currentActiveSlide.style.display = "none";
            currentActiveSlide.classList.remove('active');
        }

        state.slideIndexes[category] = index;
        const newSlide = slides[index];

        if (newSlide) {
            newSlide.style.display = "flex";
            newSlide.classList.add('active');
            const video = newSlide.querySelector('video');
            const playButton = newSlide.querySelector('.slideshow__play-button');
            if (video && playButton) {
                playButton.classList.toggle('hidden', !video.paused);
                playButton.setAttribute('aria-label', video.paused ? 'Play Video' : 'Pause Video');
            }
        }

        const slideshowElement = container.closest('.slideshow');
        slideshowElement?.querySelectorAll('.slideshow__pagination .dot')?.forEach((dot, dotIndex) => {
            dot.classList.toggle('active', dotIndex === index);
            dot.setAttribute('aria-current', dotIndex === index ? 'true' : 'false');
        });
    };

    const moveSlide = (slideshowElement, direction) => {
        if (!slideshowElement) return;
        const container = slideshowElement.querySelector('.slideshow__container');
        if (!container) return;
        const category = container.dataset.category;
        const slides = container.querySelectorAll(':scope > .slideshow__item');
        if (slides.length <= 1) return;

        let currentIndex = state.slideIndexes[category] ?? 0;
        let nextIndex = (currentIndex + direction + slides.length) % slides.length;
        showSlide(category, nextIndex);
    };

    const setActiveThumbnail = (activeThumb, navElement) => {
        if (!navElement) return;
        navElement.querySelectorAll('.video-promo__thumbnail').forEach(thumb => {
            thumb.classList.remove('active');
            thumb.setAttribute('aria-selected', 'false');
        });
        activeThumb.classList.add('active');
        activeThumb.setAttribute('aria-selected', 'true');
    };

    const handleVideoThumbnailClick = (thumbnail, section) => {
        if (!thumbnail || !section) return;
        const wrapper = section.querySelector('.video-promo__player-wrapper');
        if (!wrapper) return;

        stopAllMedia(state.activeCategory === 'MusicContent'); // Keep music if we are in music section

        const localVideoPlayer = wrapper.querySelector('video.video-promo__player');
        let existingIframe = wrapper.querySelector('.youtube-iframe');

        const rawYoutubeId = thumbnail.dataset.youtubeId;
        const localSrc = thumbnail.dataset.videoSrc;
        const cleanedYoutubeId = rawYoutubeId ? extractYouTubeId(rawYoutubeId) : null;

        if (cleanedYoutubeId) {
            if (localVideoPlayer) localVideoPlayer.style.display = 'none';
            const embedUrl = `https://www.youtube.com/embed/${cleanedYoutubeId}?autoplay=1&rel=0&enablejsapi=1`;

            if (existingIframe) {
                if (!existingIframe.src || !existingIframe.src.includes('youtube.com/embed') || !existingIframe.src.includes(cleanedYoutubeId)) {
                    existingIframe.src = embedUrl;
                }
                existingIframe.style.display = 'block';
            } else {
                existingIframe = document.createElement('iframe');
                existingIframe.className = 'youtube-iframe';
                Object.assign(existingIframe, {
                    frameBorder: '0', allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
                    allowFullscreen: true, referrerPolicy: 'strict-origin-when-cross-origin', src: embedUrl
                });
                wrapper.appendChild(existingIframe);
            }
        } else if (localSrc && localVideoPlayer) {
            if (existingIframe) {
                existingIframe.src = 'about:blank';
                existingIframe.style.display = 'none';
            }
            localVideoPlayer.style.display = 'block';
            const sourceTag = localVideoPlayer.querySelector('source') || document.createElement('source');
            if (sourceTag.getAttribute('src') !== localSrc) {
                sourceTag.setAttribute('src', localSrc);
                if (!sourceTag.type) sourceTag.type = 'video/mp4';
                if (!localVideoPlayer.contains(sourceTag)) localVideoPlayer.appendChild(sourceTag);
                localVideoPlayer.load();
            }
            localVideoPlayer.play().catch(error => console.warn("Autoplay local video promo prevented:", error));
        } else {
            if (localVideoPlayer) localVideoPlayer.style.display = 'none';
            if (existingIframe) {
                existingIframe.src = 'about:blank';
                existingIframe.style.display = 'none';
            }
            console.warn("No valid video source found for thumbnail:", thumbnail);
        }
        setActiveThumbnail(thumbnail, thumbnail.closest('.video-promo__thumbnail-nav'));
    };

    const setupYouTubePlayer = () => {
        if (state.youtubeAPIReady && state.youtubePlayer) {
            if (state.queuedYouTubeVideoId && typeof state.youtubePlayer.loadVideoById === 'function') {
                state.youtubePlayer.loadVideoById(state.queuedYouTubeVideoId);
                state.queuedYouTubeVideoId = null;
            }
            return;
        }

        if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
            state.youtubeAPIReady = true;
            if (window.YT && window.YT.Player && !state.youtubePlayer) createYouTubePlayer(); // Check if API loaded but player not created
            return;
        }

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = () => { console.error("Failed to load YouTube IFrame API script."); state.youtubeAPIReady = false; };
        const firstScriptTag = document.getElementsByTagName('script')[0];
        if (firstScriptTag && firstScriptTag.parentNode) {
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        } else {
            document.head.appendChild(tag);
        }

        window.onYouTubeIframeAPIReady = () => {
            state.youtubeAPIReady = true;
            createYouTubePlayer();
        };
    };

    const createYouTubePlayer = () => {
        if (!state.youtubeAPIReady || state.youtubePlayer || typeof YT === 'undefined' || !YT.Player) return;
        let playerContainer = document.getElementById('youtube-music-player-container');
        if (!playerContainer) {
            playerContainer = document.createElement('div');
            playerContainer.id = 'youtube-music-player-container';
            playerContainer.style.cssText = 'position:absolute; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;';
            document.body.appendChild(playerContainer);
        }
        try {
            state.youtubePlayer = new YT.Player(playerContainer.id, {
                height: '1', width: '1',
                playerVars: { 'playsinline': 1, 'autoplay': 0, 'controls': 0, 'rel': 0, 'showinfo': 0, 'modestbranding': 1, 'iv_load_policy': 3 },
                events: { 'onReady': onYouTubePlayerReady, 'onStateChange': onYouTubePlayerStateChange, 'onError': onYouTubePlayerError }
            });
        } catch (e) { console.error("Error creating YouTube player:", e); }
    };

    const onYouTubePlayerReady = (event) => {
        event.target?.setVolume(state.currentVolume * 100);
        if (state.queuedYouTubeVideoId && event.target && typeof event.target.loadVideoById === 'function') {
            event.target.loadVideoById(state.queuedYouTubeVideoId);
            state.queuedYouTubeVideoId = null;
        }
    };

    const onYouTubePlayerStateChange = (event) => {
        if (state.currentMediaType !== 'youtube' || !state.currentPlayingThumbnail) {
             if (typeof YT !== 'undefined' && YT.PlayerState && [YT.PlayerState.PAUSED, YT.PlayerState.ENDED].includes(event.data)) {
                if(state.currentMediaType !== 'audio' || (state.currentAudioPlayer && state.currentAudioPlayer.paused)) {
                    state.isAudioPlaying = false;
                    togglePlayPauseButtons(false);
                }
            }
            return;
        }

        const activePlaylistElement = document.querySelector(`#MusicContent .music-playlist[id="${state.activePlaylist}"].active`);
        if (!activePlaylistElement) return;


        const progressBar = activePlaylistElement.querySelector('.progress-bar');
        const timeCurrent = activePlaylistElement.querySelector('.time-current');
        const timeDuration = activePlaylistElement.querySelector('.time-duration');
        const duration = state.youtubePlayer?.getDuration?.();

        switch (event.data) {
            case YT.PlayerState.PLAYING:
                state.isAudioPlaying = true;
                togglePlayPauseButtons(true);
                if (timeDuration && duration > 0) timeDuration.textContent = formatTime(duration);
                startProgressTimer(state.youtubePlayer, progressBar, timeCurrent);
                break;
            case YT.PlayerState.PAUSED:
            case YT.PlayerState.ENDED:
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
                stopProgressTimer();
                if (event.data === YT.PlayerState.ENDED) {
                    if (progressBar) progressBar.value = 0;
                    if (timeCurrent) timeCurrent.textContent = formatTime(0);
                }
                break;
            case YT.PlayerState.BUFFERING:
                break;
            case YT.PlayerState.CUED:
            case YT.PlayerState.UNSTARTED:
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
                stopProgressTimer();
                if (progressBar) progressBar.value = 0;
                if (timeCurrent) timeCurrent.textContent = formatTime(0);
                if (timeDuration) timeDuration.textContent = formatTime(duration > 0 && !isNaN(duration) ? duration : 0);
                break;
        }
    };

    const onYouTubePlayerError = (event) => {
        const videoIdAttempted = state.currentPlayingThumbnail?.dataset.youtubeId ? extractYouTubeId(state.currentPlayingThumbnail.dataset.youtubeId) : 'unknown';
        console.error("YouTube Player Error:", event.data, "for video ID attempt:", videoIdAttempted);
        const activePlaylistElement = document.querySelector(`#MusicContent .music-playlist[id="${state.activePlaylist}"].active`);
        if (activePlaylistElement) {
            updatePlayerDisplayForPlaylist(activePlaylistElement, null, 'Error loading track', '', 0, 0, 0);
        }
        stopProgressTimer();
        state.isAudioPlaying = false;
        togglePlayPauseButtons(false);
    };

    const playYouTubeAudio = (rawYoutubeId, thumbnail, autoPlay = true) => {
        const youtubeId = extractYouTubeId(rawYoutubeId);
        if (!youtubeId || !thumbnail) {
            console.error("Invalid YouTube ID or thumbnail for playback. Raw ID:", rawYoutubeId);
            const playlistElement = thumbnail?.closest('.music-playlist');
            if (playlistElement) updatePlayerDisplayForPlaylist(playlistElement, thumbnail?.dataset.cover, "Invalid Video ID", thumbnail?.dataset.artist || "Error");
            return;
        }
        const clickedPlaylist = thumbnail.closest('.music-playlist');
        if (!clickedPlaylist) return;

        if (state.currentPlayingThumbnail !== thumbnail || state.currentMediaType !== 'youtube') {
            if (state.currentAudioPlayer && !state.currentAudioPlayer.paused) state.currentAudioPlayer.pause();
            const currentYTVideoId = state.youtubePlayer?.getVideoData?.()?.video_id;
            if (state.youtubePlayer?.stopVideo && state.currentMediaType === 'youtube' && currentYTVideoId !== youtubeId) {
                state.youtubePlayer.stopVideo();
            }
            stopProgressTimer(); // Stop timer for old track
        }

        setActiveMusicTrackUI(thumbnail, 'youtube', clickedPlaylist); // UI update for THIS playlist

        if (!state.youtubeAPIReady || !state.youtubePlayer || typeof state.youtubePlayer.loadVideoById !== 'function') {
            state.queuedYouTubeVideoId = youtubeId;
            setupYouTubePlayer(); // Ensure player is ready or being set up
            togglePlayPauseButtons(false); // Assume not playing until API is ready and loads
            return;
        }

        try {
            state.youtubePlayer.setVolume(state.currentVolume * 100);
            if (autoPlay) state.youtubePlayer.loadVideoById(youtubeId);
            else {
                state.youtubePlayer.cueVideoById(youtubeId);
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
            }
        } catch (e) {
            console.error("Error controlling YouTube audio playback:", e);
            state.isAudioPlaying = false;
            togglePlayPauseButtons(false);
        }
    };

    const playLocalAudio = (audioSrc, thumbnail, autoPlay = true) => {
        if (!audioSrc || !thumbnail || !state.currentAudioPlayer) return;
        const clickedPlaylist = thumbnail.closest('.music-playlist');
        if (!clickedPlaylist) return;

        if (state.currentPlayingThumbnail !== thumbnail || state.currentMediaType !== 'audio') {
            if (state.youtubePlayer?.stopVideo) state.youtubePlayer.stopVideo();
            stopProgressTimer(); // Stop timer for old track
        }

        setActiveMusicTrackUI(thumbnail, 'audio', clickedPlaylist); // UI update for THIS playlist

        const audioPlayer = state.currentAudioPlayer;
        const progressBar = clickedPlaylist.querySelector('.progress-bar'); // Get from clickedPlaylist
        const timeCurrent = clickedPlaylist.querySelector('.time-current'); // Get from clickedPlaylist

        if (audioPlayer.getAttribute('src') !== audioSrc || audioPlayer.ended) {
            audioPlayer.setAttribute('src', audioSrc);
            audioPlayer.load(); // Important to load the new source
        }

        audioPlayer.volume = state.currentVolume;
        audioPlayer.muted = false;

        const onCanPlay = () => {
             // Use data from thumbnail, not potentially stale global player if src just changed
            updatePlayerDisplayForPlaylist(clickedPlaylist, thumbnail.dataset.cover, thumbnail.dataset.title, thumbnail.dataset.artist, audioPlayer.currentTime, audioPlayer.duration, audioPlayer.duration ? (audioPlayer.currentTime / audioPlayer.duration) * 100 : 0);
            if (autoPlay) {
                audioPlayer.play().catch(error => {
                    console.warn("Autoplay prevented for local audio:", error);
                    state.isAudioPlaying = false;
                    togglePlayPauseButtons(false);
                });
            } else {
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
            }
            audioPlayer.removeEventListener('canplay', onCanPlay); // Clean up
        };
        audioPlayer.removeEventListener('canplay', onCanPlay); // Ensure no duplicates
        audioPlayer.addEventListener('canplay', onCanPlay);

        audioPlayer.onloadedmetadata = () => updatePlayerDisplayForPlaylist(clickedPlaylist, thumbnail.dataset.cover, thumbnail.dataset.title, thumbnail.dataset.artist, 0, audioPlayer.duration, 0);
        audioPlayer.onplay = () => { state.isAudioPlaying = true; togglePlayPauseButtons(true); startProgressTimer(audioPlayer, progressBar, timeCurrent); };
        audioPlayer.onpause = () => { if (!audioPlayer.ended) { state.isAudioPlaying = false; togglePlayPauseButtons(false); } stopProgressTimer(); };
        audioPlayer.onended = () => {
            state.isAudioPlaying = false; togglePlayPauseButtons(false); stopProgressTimer();
            if (progressBar) progressBar.value = 0; if (timeCurrent) timeCurrent.textContent = formatTime(0);
        };

        if (progressBar) {
            progressBar.oninput = () => {
                if (audioPlayer.duration && !isNaN(audioPlayer.duration)) audioPlayer.currentTime = (progressBar.value / 100) * audioPlayer.duration;
            };
        }
        
        if (audioPlayer.getAttribute('src') === audioSrc && audioPlayer.paused && autoPlay) {
            audioPlayer.play().catch(error => { console.warn("Resume play prevented:", error); state.isAudioPlaying = false; togglePlayPauseButtons(false); });
        } else if (audioPlayer.getAttribute('src') !== audioSrc && autoPlay) { // If src is new and should autoplay
             audioPlayer.load(); // Will trigger 'canplay'
        } else if (audioPlayer.getAttribute('src') !== audioSrc && !autoPlay) {
             audioPlayer.load(); // Load but don't autoplay
        }
    };

    const startProgressTimer = (mediaPlayerInstance, progressBarElement, timeDisplayElement) => {
        stopProgressTimer(); // Clear any existing timer
    
        // Ensure we're working with the elements from the currently active playlist
        // This is crucial if the timer was started for a playlist that is no longer active.
        const updateUITargets = () => {
            const activeVisiblePlaylist = document.querySelector(`#MusicContent .music-playlist[id="${state.activePlaylist}"].active`);
            if (!activeVisiblePlaylist) return null; // No active playlist to update
    
            return {
                progressBar: activeVisiblePlaylist.querySelector('.progress-bar'),
                timeDisplay: activeVisiblePlaylist.querySelector('.time-current')
            };
        };
    
        state.progressInterval = setInterval(() => {
            const targets = updateUITargets();
            if (!targets) { // If no active playlist, or elements not found, stop.
                stopProgressTimer();
                return;
            }
    
            let currentTime = 0, duration = 0, isMediaEffectivelyPlaying = false;
    
            if (mediaPlayerInstance === state.currentAudioPlayer && state.currentMediaType === 'audio' &&
                mediaPlayerInstance.HAVE_METADATA <= mediaPlayerInstance.readyState &&
                !mediaPlayerInstance.paused && !mediaPlayerInstance.ended && !isNaN(mediaPlayerInstance.duration)) {
                currentTime = mediaPlayerInstance.currentTime;
                duration = mediaPlayerInstance.duration;
                isMediaEffectivelyPlaying = true;
            } else if (mediaPlayerInstance === state.youtubePlayer && state.currentMediaType === 'youtube' &&
                       typeof mediaPlayerInstance.getCurrentTime === 'function' &&
                       typeof mediaPlayerInstance.getDuration === 'function' &&
                       typeof YT !== 'undefined' && YT.PlayerState) {
                const ytState = mediaPlayerInstance.getPlayerState();
                if ([YT.PlayerState.PLAYING, YT.PlayerState.BUFFERING].includes(ytState)) {
                    currentTime = mediaPlayerInstance.getCurrentTime();
                    duration = mediaPlayerInstance.getDuration();
                    isMediaEffectivelyPlaying = true;
    
                    const timeDurationEl = targets.progressBar?.parentElement?.querySelector('.time-duration');
                    if (timeDurationEl) {
                        const currentDisplayedDuration = timeDurationEl.textContent;
                        const newFormattedDuration = formatTime(duration > 0 && !isNaN(duration) ? duration : 0);
                        if (currentDisplayedDuration !== newFormattedDuration) {
                            timeDurationEl.textContent = newFormattedDuration;
                        }
                    }
                }
            }
    
            if (isMediaEffectivelyPlaying) {
                if (duration > 0 && !isNaN(duration)) {
                    const progress = (currentTime / duration) * 100;
                    if (targets.progressBar) targets.progressBar.value = progress;
                    if (targets.timeDisplay) targets.timeDisplay.textContent = formatTime(currentTime);
                } else { // Handle cases where duration might be 0 or NaN (e.g., live stream, error)
                    if (targets.progressBar) targets.progressBar.value = 0;
                    if (targets.timeDisplay) targets.timeDisplay.textContent = formatTime(0);
                }
            } else {
                 // If media is not effectively playing, but the timer is running,
                 // it means the state changed (e.g., paused, ended).
                 // The onpause/onended/onStateChange handlers should ideally call stopProgressTimer.
                 // This is a fallback.
                // stopProgressTimer();
            }
        }, 500);
    };

    const centerMusicThumbnail = (container, thumbnail) => {
        if (!container || !thumbnail) return;
        const thumbnailsScrollArea = container.querySelector('.music-thumbnails');
        if (!thumbnailsScrollArea) return;
        const scrollAreaWidth = thumbnailsScrollArea.offsetWidth;
        const thumbWidth = thumbnail.offsetWidth;
        const thumbScrollLeft = thumbnail.offsetLeft; // Position relative to its offsetParent
        const targetScrollLeft = thumbScrollLeft - (scrollAreaWidth / 2) + (thumbWidth / 2);
        thumbnailsScrollArea.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    };

    const setupMusicThumbnailDrag = () => {
        elements.musicThumbnailsContainers.forEach(container => {
            const thumbnails = container.querySelector('.music-thumbnails');
            if (!thumbnails) return;

            const handleDragStart = (e) => {
                state.isDragging = true;
                state.dragStartX = (e.pageX || e.touches?.[0].pageX) - thumbnails.offsetLeft;
                state.dragScrollLeft = thumbnails.scrollLeft;
                thumbnails.style.cursor = 'grabbing';
                thumbnails.style.userSelect = 'none'; // CSS
                thumbnails.style.scrollSnapType = 'none'; // Disable snap during drag
            };
            const handleDragMove = (e) => {
                if (!state.isDragging) return;
                e.preventDefault(); // Prevent page scroll on touch devices
                const x = (e.pageX || e.touches?.[0].pageX) - thumbnails.offsetLeft;
                const walk = (x - state.dragStartX) * 1.5; // Adjust multiplier for drag speed
                thumbnails.scrollLeft = state.dragScrollLeft - walk;
            };
            const handleDragEnd = () => {
                if (!state.isDragging) return;
                state.isDragging = false;
                thumbnails.style.cursor = 'grab';
                thumbnails.style.userSelect = ''; // CSS
                thumbnails.style.scrollSnapType = 'x mandatory'; // Re-enable snap
            };

            ['mousedown', 'touchstart'].forEach(type => thumbnails.addEventListener(type, handleDragStart, type === 'touchstart' ? { passive: true } : false));
            ['mousemove', 'touchmove'].forEach(type => document.addEventListener(type, handleDragMove, type === 'touchmove' ? { passive: false } : false)); // Listen on document for move/end
            ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(type => document.addEventListener(type, handleDragEnd)); // Listen on document
        });
    };

    const setupSlideshowDrag = () => {
        elements.slideshows.forEach(slideshowElement => {
            const container = slideshowElement.querySelector('.slideshow__container');
            if (!container) return;
            let startX = 0, isMouseDown = false, hasSwiped = false; // hasSwiped to distinguish click from swipe

            container.addEventListener('mousedown', (e) => { startX = e.pageX; isMouseDown = true; hasSwiped = false; container.style.cursor = 'grabbing'; container.style.userSelect = 'none'; });
            container.addEventListener('mousemove', (e) => { if (isMouseDown && Math.abs(e.pageX - startX) > 10) hasSwiped = true; }); // Detect if significant movement occurred
            container.addEventListener('mouseup', (e) => {
                container.style.cursor = 'grab'; container.style.userSelect = '';
                if (isMouseDown && hasSwiped) { // Only trigger swipe if mouse moved significantly
                    const distance = e.pageX - startX;
                    if (Math.abs(distance) >= state.swipeThreshold) moveSlide(slideshowElement, distance > 0 ? -1 : 1);
                }
                isMouseDown = false; startX = 0; hasSwiped = false;
            });
            container.addEventListener('mouseleave', () => { if (isMouseDown) { isMouseDown = false; startX = 0; hasSwiped = false; container.style.cursor = 'grab'; container.style.userSelect = ''; }});

            // Touch events for slideshow
            container.addEventListener('touchstart', (e) => { if (e.touches.length === 1) { state.slideshowSwipeStartX = e.touches[0].pageX; state.isSlideshowSwiping = false; }}, { passive: true });
            container.addEventListener('touchmove', (e) => {
                if (e.touches.length === 1 && state.slideshowSwipeStartX !== 0) {
                    if (Math.abs(e.touches[0].pageX - state.slideshowSwipeStartX) > 10 || state.isSlideshowSwiping) {
                        state.isSlideshowSwiping = true; // Mark as swiping after minimal movement
                        // e.preventDefault(); // Optional: prevent vertical scroll during horizontal swipe, test carefully
                    }
                }
            }, { passive: true }); // Consider passive: false if preventDefault is needed and tested
            container.addEventListener('touchend', (e) => {
                if (e.changedTouches.length === 1 && state.isSlideshowSwiping) { // Only if swiping motion was detected
                    const distance = e.changedTouches[0].pageX - state.slideshowSwipeStartX;
                    if (Math.abs(distance) >= state.swipeThreshold) moveSlide(slideshowElement, distance > 0 ? -1 : 1);
                }
                state.slideshowSwipeStartX = 0; state.isSlideshowSwiping = false;
            });
            container.addEventListener('touchcancel', () => { state.slideshowSwipeStartX = 0; state.isSlideshowSwiping = false; });
        });
    };

    const setupVolumeControls = () => {
        document.querySelectorAll('.volume-slider').forEach(volumeSlider => {
            volumeSlider.value = state.currentVolume;
            volumeSlider.addEventListener('input', () => {
                const newVolume = parseFloat(volumeSlider.value);
                state.currentVolume = newVolume;
                // Update all volume sliders if multiple exist (though usually one per active player)
                document.querySelectorAll('.volume-slider').forEach(slider => { if (slider !== volumeSlider) slider.value = newVolume; });

                if (state.currentAudioPlayer) { state.currentAudioPlayer.muted = false; state.currentAudioPlayer.volume = newVolume; }
                if (state.currentMediaType === 'youtube' && state.youtubePlayer?.setVolume) { state.youtubePlayer.unMute(); state.youtubePlayer.setVolume(newVolume * 100); }
                if (newVolume > 0) state.lastVolumeBeforeMute = newVolume; // Store last non-zero volume
            });
        });
        document.querySelectorAll('.volume-button').forEach(volumeButton => {
            volumeButton.addEventListener('click', () => {
                let isMutedCurrently = (state.currentMediaType === 'audio' && state.currentAudioPlayer) ? (state.currentAudioPlayer.muted || state.currentAudioPlayer.volume === 0) :
                                      (state.currentMediaType === 'youtube' && state.youtubePlayer?.isMuted) ? state.youtubePlayer.isMuted() : state.currentVolume === 0;
                if (!isMutedCurrently) { // If not muted, then mute
                    if (state.currentVolume > 0) state.lastVolumeBeforeMute = state.currentVolume;
                    else if (state.lastVolumeBeforeMute === 0) state.lastVolumeBeforeMute = 0.1; // Edge case: unmuting from true zero

                    if (state.currentAudioPlayer) state.currentAudioPlayer.muted = true;
                    else if (state.youtubePlayer?.mute) state.youtubePlayer.mute();
                    state.currentVolume = 0; // Reflect muted state
                } else { // If muted, then unmute
                    const restoreVolume = state.lastVolumeBeforeMute > 0 ? state.lastVolumeBeforeMute : 0.1; // Ensure some volume
                    if (state.currentAudioPlayer) { state.currentAudioPlayer.muted = false; state.currentAudioPlayer.volume = restoreVolume; }
                    else if (state.youtubePlayer?.unMute) { state.youtubePlayer.unMute(); state.youtubePlayer.setVolume(restoreVolume * 100); }
                    state.currentVolume = restoreVolume; // Reflect unmuted state
                }
                document.querySelectorAll('.volume-slider').forEach(slider => slider.value = state.currentVolume);
            });
        });
    };

    const setupEventListeners = () => {
        elements.categoryNavButtons.forEach(button => button.addEventListener('click', () => showCategoryContent(button.dataset.dropdownTarget)));
        elements.subcategoryNavs.forEach(nav => nav.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
            const targetId = button.dataset.submenuTarget; if (!targetId) return;
            nav.querySelectorAll('button').forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-current', 'false'); });
            button.classList.add('active');
            button.setAttribute('aria-current', 'true'); // Use 'true' for aria-current
            showSubContent(targetId);
        })));

        elements.slideshows.forEach(slideshow => {
            slideshow.querySelector('.slideshow__control--prev')?.addEventListener('click', () => moveSlide(slideshow, -1));
            slideshow.querySelector('.slideshow__control--next')?.addEventListener('click', () => moveSlide(slideshow, 1));
            slideshow.querySelectorAll('.slideshow__play-button').forEach(button => button.addEventListener('click', () => {
                const video = button.closest('.slideshow__item')?.querySelector('video'); if (!video) return;
                if (video.paused) video.play().then(() => { button.classList.add('hidden'); button.setAttribute('aria-label', 'Pause Video'); }).catch(e => console.warn("Video play failed:", e));
                else { video.pause(); button.classList.remove('hidden'); button.setAttribute('aria-label', 'Play Video'); }
            }));
            slideshow.querySelectorAll('video').forEach(video => {
                const playButton = video.closest('.slideshow__item')?.querySelector('.slideshow__play-button');
                video.addEventListener('ended', () => { if (playButton) { playButton.classList.remove('hidden'); playButton.setAttribute('aria-label', 'Play Video'); }});
                video.addEventListener('pause', () => { if (playButton && !video.ended) { playButton.classList.remove('hidden'); playButton.setAttribute('aria-label', 'Play Video'); }});
                video.addEventListener('play', () => { if (playButton) { playButton.classList.add('hidden'); playButton.setAttribute('aria-label', 'Pause Video'); }});
            });
        });

        elements.videoPromoSections.forEach(section => section.querySelectorAll('.video-promo__thumbnail').forEach(thumbnail => thumbnail.addEventListener('click', () => handleVideoThumbnailClick(thumbnail, section))));

        elements.musicNavButtons.forEach(button => button.addEventListener('click', () => {
            const targetPlaylistId = button.dataset.musicTarget;
            if (!targetPlaylistId || button.classList.contains('active')) return;

            elements.musicNavButtons.forEach(btn => { btn.classList.remove('active'); btn.setAttribute('aria-current', 'false'); });
            button.classList.add('active');
            button.setAttribute('aria-current', 'page');
            state.activePlaylist = targetPlaylistId;

            elements.musicPlaylists.forEach(pl => {
                const isActive = pl.id === targetPlaylistId;
                pl.style.display = isActive ? 'block' : 'none';
                pl.classList.toggle('active', isActive);
                pl.setAttribute('aria-hidden', isActive ? 'false' : 'true');
            });

            const targetPlaylistElement = document.getElementById(targetPlaylistId);
            if (targetPlaylistElement) {
                if (state.isAudioPlaying && state.currentPlayingThumbnail) {
                    const songData = {
                        cover: state.currentPlayingThumbnail.dataset.cover,
                        title: state.currentPlayingThumbnail.dataset.title,
                        artist: state.currentPlayingThumbnail.dataset.artist,
                        currentTime: 0, duration: 0, progress: 0
                    };
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                        songData.currentTime = state.currentAudioPlayer.currentTime;
                        songData.duration = state.currentAudioPlayer.duration || 0;
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.getDuration) {
                        songData.duration = state.youtubePlayer.getDuration() || 0;
                        songData.currentTime = state.youtubePlayer.getCurrentTime() || 0;
                    }
                    songData.progress = songData.duration && songData.duration > 0 ? (songData.currentTime / songData.duration) * 100 : 0;

                    updatePlayerDisplayForPlaylist(targetPlaylistElement, songData.cover, songData.title, songData.artist, songData.currentTime, songData.duration, songData.progress);
                    
                    targetPlaylistElement.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false');});
                    
                    const currentGlobalThumbSrc = state.currentPlayingThumbnail.dataset.musicSrc;
                    const currentGlobalThumbYT = state.currentPlayingThumbnail.dataset.youtubeId ? extractYouTubeId(state.currentPlayingThumbnail.dataset.youtubeId) : null;
                    const currentThumbInNewPlaylist = Array.from(targetPlaylistElement.querySelectorAll('.music-thumbnail:not([href])'))
                        .find(t => {
                            const tSrc = t.dataset.musicSrc;
                            const tYT = t.dataset.youtubeId ? extractYouTubeId(t.dataset.youtubeId) : null;
                            return (state.currentMediaType === 'audio' && tSrc && tSrc === currentGlobalThumbSrc) ||
                                   (state.currentMediaType === 'youtube' && tYT && tYT === currentGlobalThumbYT);
                        });

                    if (currentThumbInNewPlaylist) {
                        currentThumbInNewPlaylist.classList.add('active');
                        currentThumbInNewPlaylist.setAttribute('aria-selected', 'true');
                        centerMusicThumbnail(currentThumbInNewPlaylist.closest('.music-thumbnails-container'), currentThumbInNewPlaylist);
                    }

                    if (state.isAudioPlaying) {
                        const progressBar = targetPlaylistElement.querySelector('.progress-bar');
                        const timeCurrent = targetPlaylistElement.querySelector('.time-current');
                        const player = state.currentMediaType === 'audio' ? state.currentAudioPlayer : state.youtubePlayer;
                        if (player) startProgressTimer(player, progressBar, timeCurrent);
                    }
                } else { // Not playing or no current thumbnail
                    const firstThumb = targetPlaylistElement.querySelector('.music-thumbnail:not([href])');
                    if (firstThumb) {
                        updatePlayerDisplayForPlaylist(targetPlaylistElement, firstThumb.dataset.cover, firstThumb.dataset.title, firstThumb.dataset.artist);
                    } else {
                        updatePlayerDisplayForPlaylist(targetPlaylistElement, null, 'No songs available', '');
                    }
                    targetPlaylistElement.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => {t.classList.remove('active'); t.setAttribute('aria-selected', 'false');});
                }
                togglePlayPauseButtons(state.isAudioPlaying); // Sync buttons for the new active playlist
            }
        }));

        document.querySelectorAll('.music-thumbnail:not([href])').forEach(thumbnail => thumbnail.addEventListener('click', () => {
            const isPlayingThis = state.currentPlayingThumbnail === thumbnail && state.isAudioPlaying;
            const isPausedOnThis = state.currentPlayingThumbnail === thumbnail && !state.isAudioPlaying;

            if (isPlayingThis) { // Clicked on the playing song's thumbnail: Pause it
                if (state.currentMediaType === 'audio' && state.currentAudioPlayer) state.currentAudioPlayer.pause();
                else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.pauseVideo) state.youtubePlayer.pauseVideo();
            } else if (isPausedOnThis) { // Clicked on the paused song's thumbnail: Resume it
                if (state.currentMediaType === 'audio' && state.currentAudioPlayer?.paused) state.currentAudioPlayer.play().catch(e=>console.warn("Resume audio failed:", e));
                else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.playVideo && typeof YT !== 'undefined' && YT.PlayerState) {
                    const ytState = state.youtubePlayer.getPlayerState?.();
                    if ([YT.PlayerState.PAUSED, YT.PlayerState.CUED, YT.PlayerState.ENDED].includes(ytState)) state.youtubePlayer.playVideo();
                }
            } else { // Clicked on a new/different song's thumbnail: Play it
                const rawYoutubeId = thumbnail.dataset.youtubeId;
                const audioSrc = thumbnail.dataset.musicSrc;
                if (rawYoutubeId) playYouTubeAudio(rawYoutubeId, thumbnail, true);
                else if (audioSrc) playLocalAudio(audioSrc, thumbnail, true);
            }
        }));

        elements.musicPlaylists.forEach(playlistElement => {
            const playButton = playlistElement.querySelector('.play-button');
            const pauseButton = playlistElement.querySelector('.pause-button');
            const progressBar = playlistElement.querySelector('.progress-bar');

            playButton?.addEventListener('click', () => {
                if (!playlistElement.classList.contains('active')) return; // Button only works if its playlist is active

                let targetThumb = playlistElement.querySelector('.music-thumbnail.active:not([href])'); // Current active thumb in this playlist
                
                if (!targetThumb) { // If no thumb is active in this playlist, default to the first one
                    targetThumb = playlistElement.querySelector('.music-thumbnail:not([href])');
                }
                if (!targetThumb) return; // No playable track

                const isThisPlaylistTrackCurrentlyPaused = state.currentPlayingThumbnail === targetThumb && !state.isAudioPlaying;

                if (isThisPlaylistTrackCurrentlyPaused) { // Resume if this specific track was paused
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer?.paused) state.currentAudioPlayer.play().catch(e => console.warn("Resume audio failed:", e));
                    else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.playVideo && typeof YT !== 'undefined' && YT.PlayerState) {
                        const ytState = state.youtubePlayer.getPlayerState?.();
                        if ([YT.PlayerState.PAUSED, YT.PlayerState.CUED, YT.PlayerState.ENDED].includes(ytState)) state.youtubePlayer.playVideo();
                    }
                } else { // Play this track (it's new, different, or was not the one paused globally)
                    const audioSrc = targetThumb.dataset.musicSrc;
                    const rawYoutubeId = targetThumb.dataset.youtubeId;
                    if (rawYoutubeId) playYouTubeAudio(rawYoutubeId, targetThumb, true);
                    else if (audioSrc) playLocalAudio(audioSrc, targetThumb, true);
                }
            });

            pauseButton?.addEventListener('click', () => {
                // Pause button always pauses global player if its playlist is active and music is playing
                if (playlistElement.classList.contains('active') && state.isAudioPlaying) {
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer && !state.currentAudioPlayer.paused) {
                        state.currentAudioPlayer.pause();
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.pauseVideo && typeof YT !== 'undefined' && YT.PlayerState) {
                        const ytState = state.youtubePlayer.getPlayerState?.();
                        if ([YT.PlayerState.PLAYING, YT.PlayerState.BUFFERING].includes(ytState)) {
                            state.youtubePlayer.pauseVideo();
                        }
                    }
                }
            });

            progressBar?.addEventListener('input', () => {
                if (!playlistElement.classList.contains('active') || !state.currentPlayingThumbnail) return;
                // Ensure progress bar manipulation only affects the track if it's the one being displayed/controlled by this playlist.
                // This is implicitly handled if currentPlayingThumbnail's playlist is this playlistElement.
                if (state.currentPlayingThumbnail.closest('.music-playlist') !== playlistElement) return;


                if (state.currentMediaType === 'audio' && state.currentAudioPlayer?.duration && !isNaN(state.currentAudioPlayer.duration)) {
                    state.currentAudioPlayer.currentTime = (progressBar.value / 100) * state.currentAudioPlayer.duration;
                } else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.getDuration) {
                    const duration = state.youtubePlayer.getDuration();
                    if (duration > 0 && !isNaN(duration)) state.youtubePlayer.seekTo((progressBar.value / 100) * duration, true);
                }
            });
        });

        document.querySelectorAll('.music-slide-control--prev').forEach(btn => btn.addEventListener('click', () => btn.closest('.music-thumbnails-container')?.querySelector('.music-thumbnails')?.scrollBy({ left: -200, behavior: 'smooth' })));
        document.querySelectorAll('.music-slide-control--next').forEach(btn => btn.addEventListener('click', () => btn.closest('.music-thumbnails-container')?.querySelector('.music-thumbnails')?.scrollBy({ left: 200, behavior: 'smooth' })));

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            const activeMusicPlaylistElement = document.querySelector(`#MusicContent .music-playlist[id="${state.activePlaylist}"].active`);
            if (e.key === ' ' && activeMusicPlaylistElement) {
                e.preventDefault();
                const playBtn = activeMusicPlaylistElement.querySelector('.play-button');
                const pauseBtn = activeMusicPlaylistElement.querySelector('.pause-button');
                if (playBtn && !playBtn.hidden) playBtn.click(); else if (pauseBtn && !pauseBtn.hidden) pauseBtn.click();
            } else if (e.key === 'ArrowLeft') {
                const activeSlideshow = document.querySelector('.slideshow-section.active .slideshow:not(#MusicContent .slideshow)'); // Exclude music slideshows
                if (activeSlideshow) { e.preventDefault(); moveSlide(activeSlideshow, -1); }
                else if (activeMusicPlaylistElement && state.isAudioPlaying && (state.currentAudioPlayer || state.youtubePlayer)) { // Seek if music is playing
                    e.preventDefault();
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) state.currentAudioPlayer.currentTime = Math.max(0, state.currentAudioPlayer.currentTime - 5);
                    else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.seekTo && state.youtubePlayer.getCurrentTime) state.youtubePlayer.seekTo(Math.max(0, state.youtubePlayer.getCurrentTime() - 5), true);
                }
            } else if (e.key === 'ArrowRight') {
                const activeSlideshow = document.querySelector('.slideshow-section.active .slideshow:not(#MusicContent .slideshow)');
                if (activeSlideshow) { e.preventDefault(); moveSlide(activeSlideshow, 1); }
                else if (activeMusicPlaylistElement && state.isAudioPlaying && (state.currentAudioPlayer || state.youtubePlayer)) { // Seek if music is playing
                    e.preventDefault();
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer?.duration) state.currentAudioPlayer.currentTime = Math.min(state.currentAudioPlayer.duration, state.currentAudioPlayer.currentTime + 5);
                    else if (state.currentMediaType === 'youtube' && state.youtubePlayer?.seekTo && state.youtubePlayer.getDuration) {
                        const duration = state.youtubePlayer.getDuration();
                        if (!isNaN(duration) && duration > 0) state.youtubePlayer.seekTo(Math.min(duration, state.youtubePlayer.getCurrentTime() + 5), true);
                    }
                }
            }
        });
    };

    const init = () => {
        setupYouTubePlayer();
        setupMusicThumbnailDrag();
        setupSlideshowDrag();
        setupVolumeControls();
        setupEventListeners();
        if (elements.globalAudioPlayer) elements.globalAudioPlayer.volume = state.currentVolume;

        // Click the first category button to initialize content display
        if (elements.categoryNavButtons.length > 0) {
            elements.categoryNavButtons[0].click();
        } else { // Fallback if no category buttons, e.g. directly show music if that's the only content
            const musicContent = document.getElementById('MusicContent');
            if (musicContent) {
                 showCategoryContent('MusicContent');
            }
        }
        console.log("App initialized. Music player cross-playlist pause/play consistency improved.");
    };

    init();
});
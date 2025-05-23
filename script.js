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
        activePlaylist: 'latestUpload',
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
        musicNavButtons: document.querySelectorAll('.music-nav button'),
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

    const stopProgressTimer = () => {
        if (state.progressInterval) {
            clearInterval(state.progressInterval);
            state.progressInterval = null;
        }
    };

    const togglePlayPauseButtons = (isPlaying) => {
        const musicContentActive = state.activeCategory === 'MusicContent';
        const activePlaylistElement = musicContentActive ? document.querySelector('#MusicContent .music-playlist.active') : null;

        if (!musicContentActive || !activePlaylistElement) {
            elements.musicPlaylists.forEach(pl => {
                const playBtn = pl.querySelector('.play-button');
                const pauseBtn = pl.querySelector('.pause-button');
                if (playBtn && pauseBtn) {
                    playBtn.hidden = false;
                    pauseBtn.hidden = true;
                }
            });
            return;
        }

        const playButton = activePlaylistElement.querySelector('.play-button');
        const pauseButton = activePlaylistElement.querySelector('.pause-button');

        if (playButton && pauseButton) {
            playButton.hidden = isPlaying;
            pauseButton.hidden = !isPlaying;
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

        if (coverImg) coverImg.src = cover || 'Img/default-cover.png';
        if (titleEl) titleEl.textContent = title || 'Unknown Title';
        if (artistEl) artistEl.textContent = artist || 'Unknown Artist';
        if (progressBarEl) progressBarEl.value = progress;
        if (timeCurrentEl) timeCurrentEl.textContent = formatTime(currentTime);
        if (timeDurationEl) timeDurationEl.textContent = formatTime(duration);
    };

    const stopCurrentMusicPlayback = (clearAllDisplays = false) => {
        if (state.currentAudioPlayer && !state.currentAudioPlayer.paused) {
            state.currentAudioPlayer.pause();
            if (clearAllDisplays) state.currentAudioPlayer.currentTime = 0;
        }

        if (state.youtubePlayer && typeof state.youtubePlayer.stopVideo === 'function') {
            state.youtubePlayer.stopVideo();
        }

        stopProgressTimer();
        state.isAudioPlaying = false;
        togglePlayPauseButtons(false);

        if (state.currentPlayingThumbnail) {
            state.currentPlayingThumbnail.classList.remove('active');
        }
        if(clearAllDisplays) {
            state.currentPlayingThumbnail = null;
            state.currentMediaType = null;
        }
    };

    const stopAllMedia = (keepAudioIfInMusicContent = false) => {
        const isInMusicContent = state.activeCategory === 'MusicContent';

        document.querySelectorAll('video.video-promo__player, .slideshow video').forEach(video => {
            if (!video.paused) {
                video.pause();
                const slideItem = video.closest('.slideshow__item');
                if (slideItem) {
                    const playButton = slideItem.querySelector('.slideshow__play-button');
                    if (playButton) {
                        playButton.classList.remove('hidden');
                    }
                }
            }
        });

        document.querySelectorAll('.video-promo__player-wrapper .youtube-iframe').forEach(iframe => {
            if (iframe.src && iframe.src.includes('youtube.com/embed/')) {
                iframe.src = iframe.src.replace('autoplay=1', 'autoplay=0');
            }
        });

        if (!keepAudioIfInMusicContent || !isInMusicContent) {
            stopCurrentMusicPlayback(true);
        }
    };

    const hideAllContent = () => {
        elements.categoryContents.forEach(content => {
            content.style.display = 'none';
            content.classList.remove('active');
            content.querySelectorAll('.slideshow-section, .sub_menu > .slideshow-section').forEach(subContent => {
                subContent.style.display = 'none';
                subContent.classList.remove('active');
                subContent.hidden = true;
            });
        });
        elements.categoryNavButtons.forEach(button => button.classList.remove('active'));
        elements.subcategoryNavs.forEach(nav => {
            nav.querySelectorAll('button').forEach(button => button.classList.remove('active'));
        });
    };

    const showCategoryContent = (contentId) => {
        const isSwitchingToMusicContent = contentId === 'MusicContent';
        const isCurrentlyInMusicContent = state.activeCategory === 'MusicContent';

        if (!isSwitchingToMusicContent) {
            stopAllMedia(false);
        } else if (isSwitchingToMusicContent && !isCurrentlyInMusicContent) {
            stopAllMedia(false);
        }

        hideAllContent();

        const targetContent = document.getElementById(contentId);
        if (!targetContent) {
            console.error(`Target content with ID "${contentId}" not found.`);
            state.activeCategory = null;
            togglePlayPauseButtons(false);
            return;
        }

        targetContent.style.display = 'block';
        targetContent.classList.add('active');
        state.activeCategory = contentId;

        const activeButton = document.querySelector(`.category-nav__button[data-dropdown-target="${contentId}"]`);
        if (activeButton) activeButton.classList.add('active');

        if (contentId === 'MusicContent') {
            const activePlaylistElement = document.getElementById(state.activePlaylist);
            if (activePlaylistElement) {
                elements.musicPlaylists.forEach(pl => {
                    pl.style.display = (pl.id === state.activePlaylist) ? 'block' : 'none';
                    pl.classList.toggle('active', pl.id === state.activePlaylist);
                });

                if (state.isAudioPlaying && state.currentPlayingThumbnail) {
                    const songData = {
                        cover: state.currentPlayingThumbnail.getAttribute('data-cover'),
                        title: state.currentPlayingThumbnail.getAttribute('data-title'),
                        artist: state.currentPlayingThumbnail.getAttribute('data-artist'),
                        currentTime: 0,
                        duration: 0,
                        progress: 0,
                    };

                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                        songData.currentTime = state.currentAudioPlayer.currentTime;
                        songData.duration = state.currentAudioPlayer.duration || 0;
                        songData.progress = songData.duration ? (songData.currentTime / songData.duration) * 100 : 0;
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.getDuration === 'function') {
                        songData.duration = state.youtubePlayer.getDuration() || 0;
                        songData.currentTime = state.youtubePlayer.getCurrentTime() || 0;
                        songData.progress = songData.duration ? (songData.currentTime / songData.duration) * 100 : 0;
                    }

                    updatePlayerDisplayForPlaylist(activePlaylistElement, songData.cover, songData.title, songData.artist, songData.currentTime, songData.duration, songData.progress);

                    const thumbInActivePlaylist = Array.from(activePlaylistElement.querySelectorAll('.music-thumbnail:not([href])'))
                        .find(t => (t.dataset.musicSrc && state.currentPlayingThumbnail.dataset.musicSrc === t.dataset.musicSrc && state.currentMediaType === 'audio') ||
                                   (t.dataset.youtubeId && state.currentPlayingThumbnail.dataset.youtubeId === t.dataset.youtubeId && state.currentMediaType === 'youtube'));

                    activePlaylistElement.querySelectorAll('.music-thumbnail.active').forEach(t => t.classList.remove('active'));
                    if (thumbInActivePlaylist) {
                        thumbInActivePlaylist.classList.add('active');
                        centerMusicThumbnail(thumbInActivePlaylist.closest('.music-thumbnails-container'), thumbInActivePlaylist);
                    }

                    if (state.isAudioPlaying) {
                        const progressBar = activePlaylistElement.querySelector('.progress-bar');
                        const timeCurrent = activePlaylistElement.querySelector('.time-current');
                        if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                            startProgressTimer(state.currentAudioPlayer, progressBar, timeCurrent);
                        } else if (state.currentMediaType === 'youtube' && state.youtubePlayer) {
                            startProgressTimer(state.youtubePlayer, progressBar, timeCurrent);
                        }
                    }
                } else {
                    const firstThumb = activePlaylistElement.querySelector('.music-thumbnail:not([href])');
                    if (firstThumb) {
                        updatePlayerDisplayForPlaylist(activePlaylistElement, firstThumb.getAttribute('data-cover'), firstThumb.getAttribute('data-title'), firstThumb.getAttribute('data-artist'));
                    } else {
                        updatePlayerDisplayForPlaylist(activePlaylistElement, null, 'No songs available', '');
                    }
                    activePlaylistElement.querySelectorAll('.music-thumbnail.active').forEach(t => t.classList.remove('active'));
                }
            }
            togglePlayPauseButtons(state.isAudioPlaying);
        } else {
            const firstSubButton = targetContent.querySelector('.subcategory-nav__button');
            if (firstSubButton) {
                firstSubButton.click();
            }
            togglePlayPauseButtons(false);
        }
    };

    const showSubContent = (subContentId) => {
        const parentContent = document.querySelector('.category-content.active');
        if (!parentContent || parentContent.id === "MusicContent") return;

        stopAllMedia(true);

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
                if (firstThumb) {
                    handleVideoThumbnailClick(firstThumb, targetSubContent);
                }
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
        if (currentIndex < 0 || currentIndex >= slides.length) currentIndex = 0;
        state.slideIndexes[category] = currentIndex;

        if (slides[currentIndex]) {
            slides[currentIndex].style.display = "flex";
            slides[currentIndex].classList.add('active');
            const video = slides[currentIndex].querySelector('video');
            const playButton = slides[currentIndex].querySelector('.slideshow__play-button');
            if (video && playButton) {
                playButton.classList.toggle('hidden', !video.paused);
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
            dot.addEventListener('click', () => {
                showSlide(category, index);
            });
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
            }
        }

        const slideshowElement = container.closest('.slideshow');
        const dots = slideshowElement?.querySelectorAll('.slideshow__pagination .dot');
        dots?.forEach((dot, dotIndex) => {
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

        stopAllMedia(state.activeCategory === 'MusicContent');

        const localVideoPlayer = wrapper.querySelector('video.video-promo__player');
        let existingIframe = wrapper.querySelector('.youtube-iframe');

        const youtubeId = thumbnail.dataset.youtubeId;
        const localSrc = thumbnail.dataset.videoSrc;

        if (youtubeId) {
            if (localVideoPlayer) localVideoPlayer.style.display = 'none';

            const embedUrl = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0&enablejsapi=1`;

            if (existingIframe) {
                if (!existingIframe.src || !existingIframe.src.includes('youtube.com/embed/') || existingIframe.src !== embedUrl) {
                    existingIframe.src = embedUrl;
                }
                existingIframe.style.display = 'block';
            } else {
                const iframe = document.createElement('iframe');
                iframe.className = 'youtube-iframe';
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                iframe.src = embedUrl;
                wrapper.appendChild(iframe);
            }
        }
        else if (localSrc && localVideoPlayer) {
            if (existingIframe) {
                existingIframe.src = 'about:blank';
                existingIframe.style.display = 'none';
            }
            localVideoPlayer.style.display = 'block';

            const sourceTag = localVideoPlayer.querySelector('source') || document.createElement('source');
            if (sourceTag.src !== localSrc) {
                sourceTag.src = localSrc;
                if (!sourceTag.type) sourceTag.type = 'video/mp4';
                if (!localVideoPlayer.contains(sourceTag)) localVideoPlayer.appendChild(sourceTag);
                localVideoPlayer.load();
            }

            localVideoPlayer.play().catch(error => console.warn("Autoplay local video promo prevented:", error));
        } else {
            if(localVideoPlayer) localVideoPlayer.style.display = 'none';
            if(existingIframe) {
                existingIframe.src = 'about:blank';
                existingIframe.style.display = 'none';
            }
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
            if (!state.youtubePlayer) createYouTubePlayer();
            return;
        }

        const tag = document.createElement('script');
        tag.src = "https://www.youtube.com/iframe_api";
        tag.onerror = () => {
            console.error("Failed to load YouTube API script.");
            state.youtubeAPIReady = false;
        };

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
        if (!state.youtubeAPIReady || state.youtubePlayer) return;

        let playerContainer = document.getElementById('youtube-music-player-container');
        if (!playerContainer) {
            playerContainer = document.createElement('div');
            playerContainer.id = 'youtube-music-player-container';
            playerContainer.style.cssText = 'position:absolute; top:-9999px; left:-9999px; width:1px; height:1px; opacity:0; pointer-events:none;';
            document.body.appendChild(playerContainer);
        }

        try {
            state.youtubePlayer = new YT.Player(playerContainer.id, {
                height: '1',
                width: '1',
                playerVars: {
                    'playsinline': 1,
                    'autoplay': 0,
                    'controls': 0,
                    'rel': 0,
                    'showinfo': 0,
                    'modestbranding': 1,
                    'iv_load_policy': 3
                },
                events: {
                    'onReady': onYouTubePlayerReady,
                    'onStateChange': onYouTubePlayerStateChange,
                    'onError': onYouTubePlayerError
                }
            });
        } catch (e) {
            console.error("Error creating YouTube player:", e);
        }
    };

    const onYouTubePlayerReady = (event) => {
        if (event.target && typeof event.target.setVolume === 'function') {
            event.target.setVolume(state.currentVolume * 100);
        }
        if (state.queuedYouTubeVideoId && event.target && typeof event.target.loadVideoById === 'function') {
            event.target.loadVideoById(state.queuedYouTubeVideoId);
            state.queuedYouTubeVideoId = null;
        }
    };

    const onYouTubePlayerStateChange = (event) => {
        if (state.currentMediaType !== 'youtube' || !state.currentPlayingThumbnail) {
            if ((event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) && state.currentMediaType !== 'audio') {
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
            }
            return;
        }

        const activePlaylistElement = state.currentPlayingThumbnail.closest('.music-playlist');
        if (!activePlaylistElement || !activePlaylistElement.classList.contains('active')) return;

        const progressBar = activePlaylistElement.querySelector('.music-player .progress-bar');
        const timeCurrent = activePlaylistElement.querySelector('.music-player .time-current');
        const timeDuration = activePlaylistElement.querySelector('.music-player .time-duration');

        switch (event.data) {
            case YT.PlayerState.PLAYING:
                state.isAudioPlaying = true;
                togglePlayPauseButtons(true);
                if (timeDuration && state.youtubePlayer && typeof state.youtubePlayer.getDuration === 'function') {
                    const duration = state.youtubePlayer.getDuration();
                    if (duration > 0) timeDuration.textContent = formatTime(duration);
                }
                startProgressTimer(state.youtubePlayer, progressBar, timeCurrent);
                break;
            case YT.PlayerState.PAUSED:
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
                stopProgressTimer();
                break;
            case YT.PlayerState.ENDED:
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
                stopProgressTimer();
                if (progressBar) progressBar.value = 0;
                if (timeCurrent) timeCurrent.textContent = formatTime(0);
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
                if (timeDuration && state.youtubePlayer && typeof state.youtubePlayer.getDuration === 'function') {
                    const durationVal = state.youtubePlayer.getDuration();
                    timeDuration.textContent = formatTime(durationVal > 0 ? durationVal : 0);
                } else if (timeDuration) {
                    timeDuration.textContent = formatTime(0);
                }
                break;
        }
    };

    const onYouTubePlayerError = (event) => {
        console.error("YouTube Player Error:", event.data);
        if (state.currentPlayingThumbnail) {
            const activePlaylistElement = state.currentPlayingThumbnail.closest('.music-playlist');
            if (activePlaylistElement && activePlaylistElement.classList.contains('active')) {
                updatePlayerDisplayForPlaylist(activePlaylistElement, null, 'Error loading track', '', 0, 0, 0);
            }
        }
        stopProgressTimer();
        state.isAudioPlaying = false;
        togglePlayPauseButtons(false);
    };

    const playYouTubeAudio = (youtubeId, thumbnail, autoPlay = true) => {
        if (!youtubeId || !thumbnail) return;

        const clickedPlaylist = thumbnail.closest('.music-playlist');
        if (!clickedPlaylist) return;

        if (state.currentPlayingThumbnail !== thumbnail || state.currentMediaType !== 'youtube') {
            if (state.currentAudioPlayer && !state.currentAudioPlayer.paused) {
                state.currentAudioPlayer.pause();
            }
            if (state.youtubePlayer && typeof state.youtubePlayer.stopVideo === 'function' && state.currentMediaType === 'youtube') {
                if(!state.youtubePlayer.getVideoData || (state.youtubePlayer.getVideoData && state.youtubePlayer.getVideoData().video_id !== youtubeId) ) {
                   state.youtubePlayer.stopVideo();
                }
            }
            stopProgressTimer();
        }

        state.currentMediaType = 'youtube';
        state.currentPlayingThumbnail = thumbnail;

        elements.musicPlaylists.forEach(pl => {
            pl.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => t.classList.remove('active'));
        });
        thumbnail.classList.add('active');
        if (clickedPlaylist.classList.contains('active')) {
             centerMusicThumbnail(thumbnail.closest('.music-thumbnails-container'), thumbnail);
        }

        updatePlayerDisplayForPlaylist(clickedPlaylist, thumbnail.dataset.cover, thumbnail.dataset.title, thumbnail.dataset.artist, 0,0,0);

        if (!state.youtubeAPIReady || !state.youtubePlayer || typeof state.youtubePlayer.loadVideoById !== 'function') {
            state.queuedYouTubeVideoId = youtubeId;
            setupYouTubePlayer();
            togglePlayPauseButtons(false);
            return;
        }

        try {
            state.youtubePlayer.setVolume(state.currentVolume * 100);
            if (autoPlay) {
                state.youtubePlayer.loadVideoById(youtubeId);
            } else {
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
            if (state.youtubePlayer && typeof state.youtubePlayer.stopVideo === 'function') {
                state.youtubePlayer.stopVideo();
            }
            stopProgressTimer();
        }

        state.currentMediaType = 'audio';
        state.currentPlayingThumbnail = thumbnail;

        elements.musicPlaylists.forEach(pl => {
            pl.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => t.classList.remove('active'));
        });
        thumbnail.classList.add('active');
         if (clickedPlaylist.classList.contains('active')) {
             centerMusicThumbnail(thumbnail.closest('.music-thumbnails-container'), thumbnail);
        }

        updatePlayerDisplayForPlaylist(clickedPlaylist, thumbnail.dataset.cover, thumbnail.dataset.title, thumbnail.dataset.artist, 0,0,0);

        const audioPlayer = state.currentAudioPlayer;
        const progressBar = clickedPlaylist.querySelector('.music-player .progress-bar');
        const timeCurrent = clickedPlaylist.querySelector('.music-player .time-current');

        if (audioPlayer.src !== audioSrc || audioPlayer.ended) {
            audioPlayer.src = audioSrc;
            audioPlayer.load();
        }

        audioPlayer.volume = state.currentVolume;
        audioPlayer.muted = false;

        const onCanPlay = () => {
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
            audioPlayer.removeEventListener('canplay', onCanPlay);
        };

        audioPlayer.addEventListener('canplay', onCanPlay);

        audioPlayer.onloadedmetadata = () => {
            updatePlayerDisplayForPlaylist(clickedPlaylist, thumbnail.dataset.cover, thumbnail.dataset.title, thumbnail.dataset.artist, 0, audioPlayer.duration, 0);
        };

        audioPlayer.onplay = () => {
            state.isAudioPlaying = true;
            togglePlayPauseButtons(true);
            startProgressTimer(audioPlayer, progressBar, timeCurrent);
        };

        audioPlayer.onpause = () => {
            if (!audioPlayer.ended) {
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
            }
            stopProgressTimer();
        };

        audioPlayer.onended = () => {
            state.isAudioPlaying = false;
            togglePlayPauseButtons(false);
            stopProgressTimer();
            if (progressBar) progressBar.value = 0;
            if (timeCurrent) timeCurrent.textContent = formatTime(0);
        };

        if(progressBar) {
            progressBar.oninput = () => {
                if (audioPlayer.duration) {
                    const newTime = (progressBar.value / 100) * audioPlayer.duration;
                    audioPlayer.currentTime = newTime;
                }
            };
        }

        if (audioPlayer.src === audioSrc && audioPlayer.paused && autoPlay) {
            audioPlayer.play().catch(error => {
                console.warn("Resume play prevented for local audio:", error);
                state.isAudioPlaying = false;
                togglePlayPauseButtons(false);
            });
        } else if (audioPlayer.src !== audioSrc) {
             audioPlayer.load();
        }
    };

    const startProgressTimer = (mediaPlayer, progressBar, timeDisplay) => {
        stopProgressTimer();
        state.progressInterval = setInterval(() => {
            let currentTime = 0, duration = 0;

            if (mediaPlayer === state.currentAudioPlayer && state.currentMediaType === 'audio' && !mediaPlayer.paused && !mediaPlayer.ended && !isNaN(mediaPlayer.duration)) {
                currentTime = mediaPlayer.currentTime;
                duration = mediaPlayer.duration;
            }
            else if (mediaPlayer === state.youtubePlayer && state.currentMediaType === 'youtube' &&
                typeof mediaPlayer.getCurrentTime === 'function' && typeof mediaPlayer.getDuration === 'function' &&
                (mediaPlayer.getPlayerState() === YT.PlayerState.PLAYING || mediaPlayer.getPlayerState() === YT.PlayerState.BUFFERING)) {
                currentTime = mediaPlayer.getCurrentTime();
                duration = mediaPlayer.getDuration();

                if (state.currentPlayingThumbnail) {
                    const activePlaylistEl = state.currentPlayingThumbnail.closest('.music-playlist.active');
                    if (activePlaylistEl) {
                        const timeDurationEl = activePlaylistEl.querySelector('.music-player .time-duration');
                        if (timeDurationEl && duration > 0 && timeDurationEl.textContent !== formatTime(duration)) {
                            timeDurationEl.textContent = formatTime(duration);
                        } else if (timeDurationEl && duration <= 0 && timeDurationEl.textContent !== '0:00') {
                            timeDurationEl.textContent = formatTime(0);
                        }
                    }
                }
            } else {
                stopProgressTimer();
                return;
            }

            if (duration > 0) {
                const progress = (currentTime / duration) * 100;
                if (progressBar) progressBar.value = progress;
                if (timeDisplay) timeDisplay.textContent = formatTime(currentTime);
            } else if (progressBar) {
                progressBar.value = 0;
                if (timeDisplay) timeDisplay.textContent = formatTime(0);
            }
        }, 500);
    };

    const centerMusicThumbnail = (container, thumbnail) => {
        if (!container || !thumbnail) return;
        const thumbnailsScrollArea = container.querySelector('.music-thumbnails');
        if (!thumbnailsScrollArea) return;

        const scrollAreaWidth = thumbnailsScrollArea.offsetWidth;
        const thumbWidth = thumbnail.offsetWidth;
        const thumbScrollLeft = thumbnail.offsetLeft;

        const targetScrollLeft = thumbScrollLeft - (scrollAreaWidth / 2) + (thumbWidth / 2);

        thumbnailsScrollArea.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    };

    const setupMusicThumbnailDrag = () => {
        elements.musicThumbnailsContainers.forEach(container => {
            const thumbnails = container.querySelector('.music-thumbnails');
            if (!thumbnails) return;

            const handleDragStart = (e) => {
                state.isDragging = true;
                state.dragStartX = (e.pageX || (e.touches && e.touches[0].pageX)) - thumbnails.offsetLeft;
                state.dragScrollLeft = thumbnails.scrollLeft;
                thumbnails.style.cursor = 'grabbing';
                thumbnails.style.userSelect = 'none';
                thumbnails.style.scrollSnapType = 'none';
            };

            const handleDragMove = (e) => {
                if (!state.isDragging) return;
                e.preventDefault();
                const x = (e.pageX || (e.touches && e.touches[0].pageX)) - thumbnails.offsetLeft;
                const walk = (x - state.dragStartX) * 1.5;
                thumbnails.scrollLeft = state.dragScrollLeft - walk;
            };

            const handleDragEnd = () => {
                if (!state.isDragging) return;
                state.isDragging = false;
                thumbnails.style.cursor = 'grab';
                thumbnails.style.userSelect = '';
                thumbnails.style.scrollSnapType = 'x mandatory';
            };

            thumbnails.addEventListener('mousedown', handleDragStart);
            thumbnails.addEventListener('mousemove', handleDragMove);
            thumbnails.addEventListener('mouseup', handleDragEnd);
            thumbnails.addEventListener('mouseleave', handleDragEnd);

            thumbnails.addEventListener('touchstart', handleDragStart, { passive: true });
            thumbnails.addEventListener('touchmove', handleDragMove, { passive: false });
            thumbnails.addEventListener('touchend', handleDragEnd);
            thumbnails.addEventListener('touchcancel', handleDragEnd);
        });
    };

    const setupSlideshowDrag = () => {
        elements.slideshows.forEach(slideshowElement => {
            const container = slideshowElement.querySelector('.slideshow__container');
            if (!container) return;

            let startX = 0;
            let isSwiping = false;
            const swipeThreshold = state.swipeThreshold;

            container.addEventListener('mousedown', (e) => {
                startX = e.pageX;
                isSwiping = false;
                container.style.cursor = 'grabbing';
                container.style.userSelect = 'none';
            });

            container.addEventListener('mousemove', (e) => {
                if (!startX) return;
                const currentX = e.pageX;
                const distance = currentX - startX;

                if (Math.abs(distance) > 10) {
                    isSwiping = true;
                }
            });

            container.addEventListener('mouseup', (e) => {
                container.style.cursor = 'grab';
                container.style.userSelect = '';

                if (isSwiping) {
                    const currentX = e.pageX;
                    const distance = currentX - startX;

                    if (Math.abs(distance) >= swipeThreshold) {
                        if (distance > 0) {
                            moveSlide(slideshowElement, -1);
                        } else {
                            moveSlide(slideshowElement, 1);
                        }
                    }
                }
                startX = 0;
                isSwiping = false;
            });

            container.addEventListener('mouseleave', (e) => {
                if (startX) {
                    startX = 0;
                    isSwiping = false;
                    container.style.cursor = 'grab';
                    container.style.userSelect = '';
                }
            });

            container.addEventListener('touchstart', (e) => {
                if (e.touches.length === 1) {
                    state.slideshowSwipeStartX = e.touches[0].pageX;
                    state.isSlideshowSwiping = false;
                }
            }, { passive: true });

            container.addEventListener('touchmove', (e) => {
                if (e.touches.length !== 1 || state.slideshowSwipeStartX === 0) return;

                const currentX = e.touches[0].pageX;
                const distanceX = currentX - state.slideshowSwipeStartX;

                if (Math.abs(distanceX) > 10 || state.isSlideshowSwiping) {
                    state.isSlideshowSwiping = true;
                }
            }, { passive: false });

            container.addEventListener('touchend', (e) => {
                if (e.changedTouches.length !== 1) return;
                const endX = e.changedTouches[0].pageX;
                const distance = endX - state.slideshowSwipeStartX;

                if (state.isSlideshowSwiping) {
                    if (Math.abs(distance) >= swipeThreshold) {
                        if (distance > 0) {
                            moveSlide(slideshowElement, -1);
                        } else {
                            moveSlide(slideshowElement, 1);
                        }
                    }
                }
                state.slideshowSwipeStartX = 0;
                state.isSlideshowSwiping = false;
            });

            container.addEventListener('touchcancel', (e) => {
                state.slideshowSwipeStartX = 0;
                state.isSlideshowSwiping = false;
            });
        });
    };

    const setupVolumeControls = () => {
        document.querySelectorAll('.volume-slider').forEach(volumeSlider => {
            volumeSlider.value = state.currentVolume;
            volumeSlider.addEventListener('input', () => {
                const newVolume = parseFloat(volumeSlider.value);
                state.currentVolume = newVolume;

                document.querySelectorAll('.volume-slider').forEach(slider => {
                    if (slider !== volumeSlider) {
                        slider.value = newVolume;
                    }
                });

                if (state.currentAudioPlayer) {
                    state.currentAudioPlayer.muted = false;
                    state.currentAudioPlayer.volume = newVolume;
                }
                if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.setVolume === 'function') {
                    state.youtubePlayer.unMute();
                    state.youtubePlayer.setVolume(newVolume * 100);
                }

                if (newVolume > 0) {
                    state.lastVolumeBeforeMute = newVolume;
                }
            });
        });

        document.querySelectorAll('.volume-button').forEach(volumeButton => {
            volumeButton.addEventListener('click', () => {
                let isMutedCurrently = false;
                if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                    isMutedCurrently = state.currentAudioPlayer.muted || state.currentAudioPlayer.volume === 0;
                } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.isMuted === 'function') {
                    isMutedCurrently = state.youtubePlayer.isMuted();
                } else {
                    isMutedCurrently = state.currentVolume === 0;
                }

                if (!isMutedCurrently) {
                    if (state.currentVolume > 0) {
                        state.lastVolumeBeforeMute = state.currentVolume;
                    } else if (state.lastVolumeBeforeMute === 0) {
                        state.lastVolumeBeforeMute = 0.1;
                    }

                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                        state.currentAudioPlayer.muted = true;
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.mute === 'function') {
                        state.youtubePlayer.mute();
                    }
                    state.currentVolume = 0;
                    document.querySelectorAll('.volume-slider').forEach(slider => {
                        slider.value = 0;
                    });
                } else {
                    const restoreVolume = state.lastVolumeBeforeMute > 0 ? state.lastVolumeBeforeMute : 0.1;

                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                        state.currentAudioPlayer.muted = false;
                        state.currentAudioPlayer.volume = restoreVolume;
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.unMute === 'function') {
                        state.youtubePlayer.unMute();
                        state.youtubePlayer.setVolume(restoreVolume * 100);
                    }
                    state.currentVolume = restoreVolume;
                    document.querySelectorAll('.volume-slider').forEach(slider => {
                        slider.value = restoreVolume;
                    });
                }
            });
        });
    };

    const setupEventListeners = () => {
        elements.categoryNavButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.dataset.dropdownTarget;
                if (!targetId) return;
                showCategoryContent(targetId);
            });
        });

        elements.subcategoryNavs.forEach(nav => {
            nav.querySelectorAll('button').forEach(button => {
                button.addEventListener('click', () => {
                    const targetId = button.dataset.submenuTarget;
                    if (!targetId) return;
                    nav.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                    showSubContent(targetId);
                });
            });
        });

        elements.slideshows.forEach(slideshow => {
            const prevButton = slideshow.querySelector('.slideshow__control--prev');
            const nextButton = slideshow.querySelector('.slideshow__control--next');

            if (prevButton) {
                prevButton.addEventListener('click', () => moveSlide(slideshow, -1));
            }
            if (nextButton) {
                nextButton.addEventListener('click', () => moveSlide(slideshow, 1));
            }

            slideshow.querySelectorAll('.slideshow__play-button').forEach(button => {
                button.addEventListener('click', () => {
                    const slide = button.closest('.slideshow__item');
                    if (!slide) return;
                    const video = slide.querySelector('video');
                    if (!video) return;

                    if (video.paused) {
                        video.play().then(() => {
                            button.classList.add('hidden');
                        }).catch(e => console.warn("Video play failed:", e));
                    } else {
                        video.pause();
                        button.classList.remove('hidden');
                    }
                });
            });

            slideshow.querySelectorAll('video').forEach(video => {
                video.addEventListener('ended', () => {
                    const playButton = video.closest('.slideshow__item')?.querySelector('.slideshow__play-button');
                    if (playButton) {
                        playButton.classList.remove('hidden');
                    }
                });
                video.addEventListener('pause', () => {
                    const playButton = video.closest('.slideshow__item')?.querySelector('.slideshow__play-button');
                    if (playButton && !video.ended) {
                        playButton.classList.remove('hidden');
                    }
                });
                video.addEventListener('play', () => {
                    const playButton = video.closest('.slideshow__item')?.querySelector('.slideshow__play-button');
                    if (playButton) {
                        playButton.classList.add('hidden');
                    }
                });
            });
        });

        elements.videoPromoSections.forEach(section => {
            section.querySelectorAll('.video-promo__thumbnail').forEach(thumbnail => {
                thumbnail.addEventListener('click', () => handleVideoThumbnailClick(thumbnail, section));
            });
        });

        document.querySelectorAll('.music-nav button').forEach(button => {
            button.addEventListener('click', () => {
                const targetPlaylistId = button.dataset.musicTarget;
                if (!targetPlaylistId || button.classList.contains('active')) return;

                document.querySelectorAll('.music-nav button').forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                state.activePlaylist = targetPlaylistId;

                elements.musicPlaylists.forEach(pl => {
                    pl.style.display = (pl.id === targetPlaylistId) ? 'block' : 'none';
                    pl.classList.toggle('active', pl.id === targetPlaylistId);
                });

                const targetPlaylistElement = document.getElementById(targetPlaylistId);
                if (targetPlaylistElement) {
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
                            songData.progress = songData.duration ? (songData.currentTime / songData.duration) * 100 : 0;
                        } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.getDuration === 'function') {
                            songData.duration = state.youtubePlayer.getDuration() || 0;
                            songData.currentTime = state.youtubePlayer.getCurrentTime() || 0;
                            songData.progress = songData.duration ? (songData.currentTime / songData.duration) * 100 : 0;
                        }
                        updatePlayerDisplayForPlaylist(targetPlaylistElement, songData.cover, songData.title, songData.artist, songData.currentTime, songData.duration, songData.progress);

                        targetPlaylistElement.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => t.classList.remove('active'));
                        const currentThumbInNewPlaylist = Array.from(targetPlaylistElement.querySelectorAll('.music-thumbnail:not([href])'))
                            .find(t => (t.dataset.musicSrc && state.currentPlayingThumbnail.dataset.musicSrc === t.dataset.musicSrc && state.currentMediaType === 'audio') ||
                                       (t.dataset.youtubeId && state.currentPlayingThumbnail.dataset.youtubeId === t.dataset.youtubeId && state.currentMediaType === 'youtube'));
                        if (currentThumbInNewPlaylist) {
                            currentThumbInNewPlaylist.classList.add('active');
                            centerMusicThumbnail(currentThumbInNewPlaylist.closest('.music-thumbnails-container'), currentThumbInNewPlaylist);
                        }

                        if (state.isAudioPlaying) {
                            const progressBar = targetPlaylistElement.querySelector('.progress-bar');
                            const timeCurrent = targetPlaylistElement.querySelector('.time-current');
                            if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                                startProgressTimer(state.currentAudioPlayer, progressBar, timeCurrent);
                            } else if (state.currentMediaType === 'youtube' && state.youtubePlayer) {
                                startProgressTimer(state.youtubePlayer, progressBar, timeCurrent);
                            }
                        }
                    } else {
                        const firstThumb = targetPlaylistElement.querySelector('.music-thumbnail:not([href])');
                        if (firstThumb) {
                            updatePlayerDisplayForPlaylist(targetPlaylistElement, firstThumb.dataset.cover, firstThumb.dataset.title, firstThumb.dataset.artist);
                        } else {
                            updatePlayerDisplayForPlaylist(targetPlaylistElement, null, 'No songs available', '');
                        }
                        targetPlaylistElement.querySelectorAll('.music-thumbnail:not([href]).active').forEach(t => t.classList.remove('active'));
                    }
                    togglePlayPauseButtons(state.isAudioPlaying);
                }
            });
        });

        document.querySelectorAll('.music-thumbnail:not([href])').forEach(thumbnail => {
            thumbnail.addEventListener('click', () => {
                const isCurrentlyPlayingThisExactTrack = state.currentPlayingThumbnail === thumbnail && state.isAudioPlaying;
                const isCurrentlyPausedOnThisExactTrack = state.currentPlayingThumbnail === thumbnail && !state.isAudioPlaying;

                if (isCurrentlyPlayingThisExactTrack) {
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) state.currentAudioPlayer.pause();
                    else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.pauseVideo === 'function') state.youtubePlayer.pauseVideo();
                } else if (isCurrentlyPausedOnThisExactTrack) {
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer && state.currentAudioPlayer.paused) {
                        state.currentAudioPlayer.play().catch(e=>console.warn("Resume audio failed:", e));
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.playVideo === 'function') {
                        const ytState = state.youtubePlayer.getPlayerState ? state.youtubePlayer.getPlayerState() : -1;
                        if (ytState === YT.PlayerState.PAUSED || ytState === YT.PlayerState.CUED || ytState === YT.PlayerState.ENDED) {
                           state.youtubePlayer.playVideo();
                        }
                    }
                } else {
                    const youtubeId = thumbnail.dataset.youtubeId;
                    const audioSrc = thumbnail.dataset.musicSrc;
                    if (youtubeId) playYouTubeAudio(youtubeId, thumbnail, true);
                    else if (audioSrc) playLocalAudio(audioSrc, thumbnail, true);
                }
            });
        });

        elements.musicPlaylists.forEach(playlistElement => {
            const playButton = playlistElement.querySelector('.play-button');
            const pauseButton = playlistElement.querySelector('.pause-button');
            const progressBar = playlistElement.querySelector('.progress-bar');

            if (playButton) {
                playButton.addEventListener('click', () => {
                    let targetThumb = playlistElement.querySelector('.music-thumbnail.active:not([href])');
                    if (!targetThumb && state.currentPlayingThumbnail && state.currentPlayingThumbnail.closest('.music-playlist') === playlistElement) {
                        targetThumb = state.currentPlayingThumbnail;
                    } else if (!targetThumb) {
                         targetThumb = playlistElement.querySelector('.music-thumbnail:not([href])');
                    }

                    if (!targetThumb) return;

                    if (state.currentPlayingThumbnail === targetThumb && !state.isAudioPlaying) {
                        if (state.currentMediaType === 'audio' && state.currentAudioPlayer && state.currentAudioPlayer.paused) {
                            state.currentAudioPlayer.play().catch(e => console.warn("Resume audio failed:", e));
                        } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.playVideo === 'function') {
                             const ytState = state.youtubePlayer.getPlayerState ? state.youtubePlayer.getPlayerState() : -1;
                             if (ytState === YT.PlayerState.PAUSED || ytState === YT.PlayerState.CUED || ytState === YT.PlayerState.ENDED) {
                                state.youtubePlayer.playVideo();
                             } else {
                                const youtubeId = targetThumb.dataset.youtubeId;
                                if (youtubeId) playYouTubeAudio(youtubeId, targetThumb, true);
                             }
                        }
                    } else {
                        const audioSrc = targetThumb.dataset.musicSrc;
                        const youtubeId = targetThumb.dataset.youtubeId;
                        if (youtubeId) playYouTubeAudio(youtubeId, targetThumb, true);
                        else if (audioSrc) playLocalAudio(audioSrc, targetThumb, true);
                    }
                });
            }

            if (pauseButton) {
                pauseButton.addEventListener('click', () => {
                    if (state.isAudioPlaying && state.currentPlayingThumbnail && state.currentPlayingThumbnail.closest('.music-playlist') === playlistElement) {
                        if (state.currentMediaType === 'audio' && state.currentAudioPlayer && !state.currentAudioPlayer.paused) {
                            state.currentAudioPlayer.pause();
                        } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.pauseVideo === 'function') {
                             const ytState = state.youtubePlayer.getPlayerState ? state.youtubePlayer.getPlayerState() : -1;
                             if (ytState === YT.PlayerState.PLAYING || ytState === YT.PlayerState.BUFFERING) {
                                state.youtubePlayer.pauseVideo();
                             }
                        }
                    }
                });
            }

            if (progressBar) {
                progressBar.addEventListener('input', () => {
                    if (!state.currentPlayingThumbnail || state.currentPlayingThumbnail.closest('.music-playlist') !== playlistElement) return;

                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer && state.currentAudioPlayer.duration) {
                        const newTime = (progressBar.value / 100) * state.currentAudioPlayer.duration;
                        state.currentAudioPlayer.currentTime = newTime;
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.getDuration === 'function') {
                        const duration = state.youtubePlayer.getDuration();
                        if (duration > 0) {
                            const newTime = (progressBar.value / 100) * duration;
                            state.youtubePlayer.seekTo(newTime, true);
                        }
                    }
                });
            }
        });

        document.querySelectorAll('.music-slide-control--prev').forEach(button => {
            button.addEventListener('click', () => {
                const thumbnails = button.closest('.music-thumbnails-container')?.querySelector('.music-thumbnails');
                if (thumbnails) thumbnails.scrollBy({ left: -200, behavior: 'smooth' });
            });
        });

        document.querySelectorAll('.music-slide-control--next').forEach(button => {
            button.addEventListener('click', () => {
                const thumbnails = button.closest('.music-thumbnails-container')?.querySelector('.music-thumbnails');
                if (thumbnails) thumbnails.scrollBy({ left: 200, behavior: 'smooth' });
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
                return;
            }

            const activeMusicPlaylistElement = document.querySelector('#MusicContent .music-playlist.active');

            if (e.key === ' ' && activeMusicPlaylistElement) {
                e.preventDefault();
                const playButton = activeMusicPlaylistElement.querySelector('.play-button');
                const pauseButton = activeMusicPlaylistElement.querySelector('.pause-button');
                if (playButton && !playButton.hidden) playButton.click();
                else if (pauseButton && !pauseButton.hidden) pauseButton.click();
            }
            else if (e.key === 'ArrowLeft') {
                const activeSlideshow = document.querySelector('.slideshow-section.active .slideshow:not(#MusicContent .slideshow)');
                if (activeSlideshow) {
                    e.preventDefault();
                    moveSlide(activeSlideshow, -1);
                } else if (activeMusicPlaylistElement && state.currentMediaType && (state.currentAudioPlayer || state.youtubePlayer)) {
                    e.preventDefault();
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer) {
                        state.currentAudioPlayer.currentTime = Math.max(0, state.currentAudioPlayer.currentTime - 5);
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.seekTo === 'function' && typeof state.youtubePlayer.getCurrentTime === 'function') {
                        state.youtubePlayer.seekTo(Math.max(0, state.youtubePlayer.getCurrentTime() - 5), true);
                    }
                }
            }
            else if (e.key === 'ArrowRight') {
                const activeSlideshow = document.querySelector('.slideshow-section.active .slideshow:not(#MusicContent .slideshow)');
                if (activeSlideshow) {
                    e.preventDefault();
                    moveSlide(activeSlideshow, 1);
                } else if (activeMusicPlaylistElement && state.currentMediaType && (state.currentAudioPlayer || state.youtubePlayer)) {
                    e.preventDefault();
                    if (state.currentMediaType === 'audio' && state.currentAudioPlayer && !isNaN(state.currentAudioPlayer.duration)) {
                        state.currentAudioPlayer.currentTime = Math.min(state.currentAudioPlayer.duration, state.currentAudioPlayer.currentTime + 5);
                    } else if (state.currentMediaType === 'youtube' && state.youtubePlayer && typeof state.youtubePlayer.seekTo === 'function' && typeof state.youtubePlayer.getDuration === 'function') {
                        const duration = state.youtubePlayer.getDuration();
                        if (!isNaN(duration) && duration > 0) {
                            state.youtubePlayer.seekTo(Math.min(duration, state.youtubePlayer.getCurrentTime() + 5), true);
                        }
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

        if(elements.globalAudioPlayer) {
            elements.globalAudioPlayer.volume = state.currentVolume;
        }

        if (elements.categoryNavButtons.length > 0) {
            const firstCategoryTargetId = elements.categoryNavButtons[0].dataset.dropdownTarget;
            if (firstCategoryTargetId) {
                elements.categoryNavButtons[0].click();
            }
        } else {
            togglePlayPauseButtons(false);
        }

        console.log("App initialized.");
    };

    init();
});
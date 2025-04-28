document.addEventListener('DOMContentLoaded', function () {
    // DOM Elements - General
    const modeSelectionOverlay = document.getElementById('modeSelection');
    const standardModeBtn = document.getElementById('standardModeBtn');
    const meetingModeBtn = document.getElementById('meetingModeBtn');
    const switchModeButton = document.getElementById('switchModeButton');
    const currentModeText = document.getElementById('current-mode');
    const transcriptionText = document.getElementById('transcription-result');
    const aiResponseText = document.getElementById('ai-response');
    const statusElement = document.getElementById('status-message');
    const recordingIndicator = document.getElementById('recording-indicator');
    const recordingDot = document.getElementById('recording-dot');

    // DOM Elements - Standard Mode
    const startRecordButton = document.getElementById('start-btn');
    const clearTranscriptionButton = document.getElementById('clear-btn');
    const screenShareButton = document.getElementById('screen-share-btn');
    const helpButton = document.getElementById('helpButton');

    // DOM Elements - Image Analysis
    const imageAnalysisSection = document.querySelector('.image-analysis-section');
    const uploadImageBtn = document.getElementById('analyze-images-btn');
    const imageFileInput = document.createElement('input');
    imageFileInput.type = 'file';
    imageFileInput.accept = 'image/*';
    imageFileInput.multiple = true;
    imageFileInput.style.display = 'none';
    document.body.appendChild(imageFileInput);

    const pasteArea = document.getElementById('paste-area');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const analyzeImagesBtn = document.getElementById('analyze-images-btn');

    // DOM Elements - Modals
    const helpModal = document.getElementById('help-modal');
    const settingsModal = document.getElementById('settings-modal');
    const closeHelpButton = document.getElementById('close-help');
    const closeSettingsButton = document.getElementById('close-settings');
    const closeHelpBtn = document.getElementById('close-help-btn');
    const settingsCancelBtn = document.getElementById('settings-cancel');
    const settingsSaveBtn = document.getElementById('settings-save');

    // DOM Elements - Camera Modal
    const scanButton = document.getElementById('scan-btn');
    const cameraModal = document.getElementById('camera-modal');
    const closeCameraBtn = document.getElementById('close-camera');
    const cameraPreview = document.getElementById('camera-preview');
    const cameraCapture = document.getElementById('camera-capture');
    const capturedImageContainer = document.getElementById('captured-image-container');
    const capturedImage = document.getElementById('captured-image');
    const takePhotoBtn = document.getElementById('take-photo-btn');
    const retakePhotoBtn = document.getElementById('retake-photo-btn');
    const sendPhotoBtn = document.getElementById('send-photo-btn');

    // Settings defaults
    let settings = {
        language: 'en-US',
        saveTranscriptions: true,
        timeout: 10,
        energyThreshold: 300,
        useVoiceCloning: false,
        meetingMode: {
            autoProcessInterval: 15, // seconds
            screenPreviewSize: 'small',
            processingType: 'continuous' // 'continuous' or 'manual'
        },
        voiceTuning: {
            pitchShift: 0,
            speed: 1.0,
            clarity: 1.0,
            bassBoost: 0.0,
            trebleBoost: 0.0,
            echo: 0.0
        }
    };

    // App state
    let currentMode = 'standard'; // 'standard' or 'meeting'
    let isRecording = false;
    let isMeetingRecording = false;
    let mediaRecorder = null;
    let audioContext = null;
    let streamProcessor = null;
    let capturedStream = null;
    let screenStream = null;
    let audioStream = null;
    let autoProcessTimer = null;
    let transcriptionHistory = [];
    let previousTranscriptions = new Set();
    let uploadedImages = [];
    const MAX_IMAGES = 7;

    // Puter cloud storage paths
    const PUTER_STORAGE_DIR = 'voice_transcriptions';
    let currentTranscriptionId = null;
    let isInitialized = false;

    // Add recognitionStartTime to track when the current session started
    let recognitionStartTime = 0;

    // Variables for camera functionality
    let stream = null;
    let capturedImageData = null;

    // Initialize Puter cloud storage
    async function initPuterStorage() {
        if (!isInitialized && typeof puter !== 'undefined' && puter.fs) {
            try {
                // Check if the storage directory exists, if not create it
                try {
                    await puter.fs.readdir(PUTER_STORAGE_DIR);
                } catch (error) {
                    // Directory doesn't exist, create it
                    await puter.fs.mkdir(PUTER_STORAGE_DIR, { createMissingParents: true });
                    console.log(`Created storage directory: ${PUTER_STORAGE_DIR}`);
                }
                isInitialized = true;
                console.log('Puter storage initialized successfully');
            } catch (error) {
                console.error('Error initializing Puter storage:', error);
            }
        }
    }

    // Save transcription and AI response to Puter cloud
    async function saveToCloud(transcription, aiResponse) {
        if (!isInitialized || !transcription || !aiResponse) return;

        try {
            // Generate a unique ID for this transcription/response pair
            const timestamp = new Date().toISOString();
            const id = `trans_${timestamp.replace(/[:.]/g, '-')}`;
            currentTranscriptionId = id;

            // Create data object
            const data = {
                id,
                timestamp,
                transcription,
                aiResponse,
                mode: currentMode
            };

            // Save to Puter cloud
            await puter.fs.write(
                `${PUTER_STORAGE_DIR}/${id}.json`,
                JSON.stringify(data, null, 2),
                { createMissingParents: true }
            );

            console.log(`Saved transcription and response with ID: ${id}`);
            return id;
        } catch (error) {
            console.error('Error saving to Puter cloud:', error);
            return null;
        }
    }

    // Load transcription and AI response from Puter cloud
    async function loadFromCloud(id) {
        if (!isInitialized) return null;

        try {
            const blob = await puter.fs.read(`${PUTER_STORAGE_DIR}/${id}.json`);
            const text = await blob.text();
            return JSON.parse(text);
        } catch (error) {
            console.error(`Error loading data for ID ${id}:`, error);
            return null;
        }
    }

    // Load all saved transcriptions from Puter cloud
    async function loadAllTranscriptions() {
        if (!isInitialized) return [];

        try {
            const files = await puter.fs.readdir(PUTER_STORAGE_DIR);
            const jsonFiles = files.filter(file => file.name.endsWith('.json'));

            const transcriptionsPromises = jsonFiles.map(async (file) => {
                try {
                    const blob = await puter.fs.read(`${PUTER_STORAGE_DIR}/${file.name}`);
                    const text = await blob.text();
                    return JSON.parse(text);
                } catch (error) {
                    console.error(`Error loading file ${file.name}:`, error);
                    return null;
                }
            });

            const transcriptions = await Promise.all(transcriptionsPromises);
            return transcriptions.filter(t => t !== null).sort((a, b) => {
                return new Date(b.timestamp) - new Date(a.timestamp);
            });
        } catch (error) {
            console.error('Error loading all transcriptions:', error);
            return [];
        }
    }

    // Delete all saved transcriptions from Puter cloud
    async function clearCloudStorage() {
        if (!isInitialized) return;

        try {
            await puter.fs.delete(PUTER_STORAGE_DIR, { recursive: true });
            await puter.fs.mkdir(PUTER_STORAGE_DIR, { createMissingParents: true });
            console.log('Cleared all stored transcriptions');
        } catch (error) {
            console.error('Error clearing cloud storage:', error);
        }
    }

    // Function to display previous transcriptions in the panel
    async function displayPreviousTranscriptions() {
        try {
            const savedTranscriptions = await loadAllTranscriptions();
            if (savedTranscriptions.length === 0) return;

            // Clear existing transcriptions first
            transcriptionText.innerHTML = '';

            savedTranscriptions.forEach(item => {
                const finalElement = document.createElement('div');
                finalElement.className = 'transcription-final';
                finalElement.dataset.id = item.id;

                // Add timestamp
                const timestamp = document.createElement('div');
                timestamp.className = 'transcription-timestamp';
                timestamp.textContent = new Date(item.timestamp).toLocaleString();

                const content = document.createElement('div');
                content.className = 'transcription-content';
                content.textContent = item.transcription.length > 100
                    ? item.transcription.substring(0, 100) + '...'
                    : item.transcription;

                finalElement.appendChild(timestamp);
                finalElement.appendChild(content);
                transcriptionText.appendChild(finalElement);

                // Add click event to load the associated AI response
                finalElement.addEventListener('click', async () => {
                    // Highlight the selected transcription
                    document.querySelectorAll('.transcription-final').forEach(el => {
                        el.classList.remove('selected');
                    });
                    finalElement.classList.add('selected');

                    // Load and display the associated AI response
                    const aiResponseElement = document.getElementById('ai-response');
                    aiResponseElement.innerHTML = marked.parse(item.aiResponse);

                    // Apply enhanced code block styling
                    enhanceCodeBlocks(aiResponseElement);

                    // Update status
                    const aiStatusElement = document.getElementById('ai-status');
                    aiStatusElement.className = 'ai-status success';
                    aiStatusElement.textContent = 'Loaded saved response';
                    aiStatusElement.style.display = 'block';
                });
            });
        } catch (error) {
            console.error('Error displaying previous transcriptions:', error);
        }
    }

    // Speech Recognition Setup
    let recognition = null;

    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = settings.language;

        // Set up speech recognition event listeners
        recognition.onstart = function () {
            isRecording = true;
            statusElement.textContent = 'Listening...';
            recordingIndicator.classList.add('active');
            recordingIndicator.style.display = 'flex';
        };

        // Enhance the transcript display with better formatting
        recognition.onresult = function (event) {
            let interimTranscript = '';
            let finalTranscript = '';
            let hasContent = false;

            // Create a set of already-processed final transcripts
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript.trim();

                // Skip empty or very short transcripts (likely background noise)
                if (transcript.length <= 2) continue;

                hasContent = true;

                if (event.results[i].isFinal) {
                    // Check if this transcript has been processed before
                    if (!previousTranscriptions.has(transcript)) {
                        finalTranscript += transcript + ' ';
                        previousTranscriptions.add(transcript);
                    }
                } else {
                    interimTranscript += transcript;
                }
            }

            // Only update UI if there's actual content
            if (hasContent && finalTranscript) {
                const finalElement = document.createElement('div');
                finalElement.className = 'transcription-final';
                // Add data attribute for the current session
                finalElement.setAttribute('data-session', recognitionStartTime.toString());

                // Add timestamp for better separation between transcriptions
                const timestamp = document.createElement('div');
                timestamp.className = 'transcription-timestamp';
                timestamp.textContent = new Date().toLocaleTimeString();

                const content = document.createElement('div');
                content.className = 'transcription-content';
                content.textContent = finalTranscript;

                finalElement.appendChild(timestamp);
                finalElement.appendChild(content);

                // Insert at the beginning (top) instead of appending at the end
                if (transcriptionText.firstChild) {
                    transcriptionText.insertBefore(finalElement, transcriptionText.firstChild);
                } else {
                    transcriptionText.appendChild(finalElement);
                }

                // Auto-scroll to the top to show the latest transcription
                transcriptionText.scrollTop = 0;
            }

            // Update the UI with interim transcripts - always at the top
            // Only show interim transcripts if they contain something meaningful
            if (hasContent && interimTranscript && interimTranscript.trim().length > 2) {
                let interimElement = transcriptionText.querySelector('.transcription-interim');
                if (!interimElement) {
                    interimElement = document.createElement('div');
                    interimElement.className = 'transcription-interim';
                    transcriptionText.insertBefore(interimElement, transcriptionText.firstChild);
                } else {
                    // Move the existing interim element to the top
                    transcriptionText.insertBefore(interimElement, transcriptionText.firstChild);
                }

                interimElement.textContent = interimTranscript;
                // Keep scroll at the top
                transcriptionText.scrollTop = 0;
            }
        };

        recognition.onerror = function (event) {
            console.error('Recognition error:', event.error);
            statusElement.textContent = 'Error: ' + event.error;

            // If it's not a no-speech error (which is common), we should stop recording
            if (event.error !== 'no-speech') {
                stopRecording();
                startRecordButton.disabled = false;
                recordingIndicator.classList.remove('active');
                recordingIndicator.style.display = 'none';
            }
        };

        recognition.onend = function () {
            if (isRecording) {
                // This is to handle the automatic stop that occurs after a few seconds
                // We restart the recognition if we're still in recording mode
                try {
                    recognition.start();
                } catch (e) {
                    console.log('Could not restart recognition:', e);
                }
            } else {
                statusElement.textContent = 'Voice recognition stopped.';
                recordingIndicator.classList.remove('active');
                recordingIndicator.style.display = 'none';
            }
        };
    } else {
        statusElement.textContent = 'Speech recognition not supported in this browser.';
        startRecordButton.disabled = true;
    }

    // Initialize Puter cloud storage when page loads
    initPuterStorage().then(() => {
        // Load previous transcriptions after storage is initialized
        displayPreviousTranscriptions();
    });

    // Initialize AI models
    const aiModels = [
        'gpt-4.1',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
        'gpt-4.5-preview',
        'gpt-4o',
        'gpt-4o-mini',
        'o1',
        'o1-mini',
        'o1-pro',
        'o3',
        'o3-mini',
        'o4-mini'
    ];

    // Default model to use
    let currentModel = 'gpt-4o';

    // Check if first time loading the app
    const isFirstLoad = !localStorage.getItem('appMode');
    if (isFirstLoad) {
        // Show mode selection on first load
        modeSelectionOverlay.style.display = 'flex';
    } else {
        // Load saved mode
        currentMode = localStorage.getItem('appMode') || 'standard';
        setAppMode(currentMode);
    }

    // Event Listeners - Mode Selection
    standardModeBtn.addEventListener('click', function () {
        setAppMode('standard');
        modeSelectionOverlay.style.display = 'none';
        localStorage.setItem('appMode', 'standard');
    });

    meetingModeBtn.addEventListener('click', function () {
        setAppMode('meeting');
        modeSelectionOverlay.style.display = 'none';
        localStorage.setItem('appMode', 'meeting');
    });

    switchModeButton.addEventListener('click', function () {
        modeSelectionOverlay.style.display = 'flex';
    });

    // Add event listeners for recording controls
    startRecordButton.addEventListener('click', function () {
        if (!isRecording) {
            // Start recording
            startRecording();
            // Update button appearance
            startRecordButton.querySelector('i').className = 'fas fa-stop';
            startRecordButton.querySelector('.square-btn-label').textContent = 'Stop';
            startRecordButton.classList.add('recording');
            startRecordButton.style.backgroundColor = '#F44336';
            recordingIndicator.style.display = 'flex';
            recordingDot.classList.add('active');
        } else {
            // Stop recording
            stopRecording();
            // Update button appearance
            startRecordButton.querySelector('i').className = 'fas fa-play';
            startRecordButton.querySelector('.square-btn-label').textContent = 'Start';
            startRecordButton.classList.remove('recording');
            startRecordButton.style.backgroundColor = '#4CAF50';
            recordingIndicator.style.display = 'none';
            recordingDot.classList.remove('active');

            // Clear previous AI responses before processing new transcription
            aiResponseText.innerHTML = '';

            // Process only the latest transcription with AI
            const latestTranscription = getLatestTranscription();
            if (latestTranscription) {
                processWithAI(latestTranscription);
            }
        }
    });

    clearTranscriptionButton.addEventListener('click', function () {
        transcriptionText.innerHTML = '';
        aiResponseText.innerHTML = '';
        statusElement.textContent = 'Transcription cleared';

        // Also offer to clear cloud storage if there are saved transcriptions
        if (isInitialized) {
            if (confirm('Do you also want to clear all saved transcriptions from cloud storage?')) {
                clearCloudStorage().then(() => {
                    statusElement.textContent = 'All saved transcriptions cleared';
                });
            }
        }
    });

    screenShareButton.addEventListener('click', function () {
        if (isMeetingRecording) {
            stopScreenShare();
            screenShareButton.innerHTML = '<i class="fas fa-desktop"></i> Share Screen';
        } else {
            startScreenShare();
            screenShareButton.innerHTML = '<i class="fas fa-desktop"></i> Stop Sharing';
        }
    });

    // Event listeners for help button and modal
    helpButton.addEventListener('click', function () {
        helpModal.classList.add('active');
        helpModal.style.display = 'flex';
    });

    closeHelpButton.addEventListener('click', function () {
        helpModal.classList.remove('active');
        helpModal.style.display = 'none';
    });

    closeHelpBtn.addEventListener('click', function () {
        helpModal.classList.remove('active');
        helpModal.style.display = 'none';
    });

    // Event listeners for settings modal
    document.getElementById('settings-cancel').addEventListener('click', function () {
        settingsModal.classList.remove('active');
        settingsModal.style.display = 'none';
    });

    document.getElementById('settings-save').addEventListener('click', function () {
        saveSettings();
        settingsModal.classList.remove('active');
        settingsModal.style.display = 'none';
    });

    // Event Listeners - Image Upload
    pasteArea.addEventListener('click', function () {
        imageFileInput.click();
    });

    imageFileInput.addEventListener('change', handleImageUpload);

    document.addEventListener('paste', function (event) {
        if (pasteArea.matches(':hover') || imageAnalysisSection.contains(event.target)) {
            handleImagePaste(event);
        }
    });

    pasteArea.addEventListener('dragover', function (event) {
        event.preventDefault();
        pasteArea.classList.add('dragover');
    });

    pasteArea.addEventListener('dragleave', function (event) {
        event.preventDefault();
        pasteArea.classList.remove('dragover');
    });

    pasteArea.addEventListener('drop', function (event) {
        event.preventDefault();
        pasteArea.classList.remove('dragover');

        if (event.dataTransfer.files.length > 0) {
            handleImageFiles(event.dataTransfer.files);
        }
    });

    analyzeImagesBtn.addEventListener('click', analyzeImages);

    // Add event listeners for camera functionality
    if (scanButton) {
        scanButton.addEventListener('click', openCamera);
    }

    if (closeCameraBtn) {
        closeCameraBtn.addEventListener('click', closeCamera);
    }

    if (takePhotoBtn) {
        takePhotoBtn.addEventListener('click', takePhoto);
    }

    if (retakePhotoBtn) {
        retakePhotoBtn.addEventListener('click', retakePhoto);
    }

    if (sendPhotoBtn) {
        sendPhotoBtn.addEventListener('click', sendPhotoToAI);
    }

    // Function to open camera
    async function openCamera() {
        console.log("Opening camera...");
        try {
            // Show the modal first
            if (cameraModal) {
                cameraModal.style.display = 'flex';
                cameraModal.classList.add('active');
            }

            // Reset UI state
            if (cameraPreview) cameraPreview.style.display = 'block';
            if (capturedImageContainer) capturedImageContainer.style.display = 'none';
            if (takePhotoBtn) takePhotoBtn.style.display = 'block';
            if (retakePhotoBtn) retakePhotoBtn.style.display = 'none';
            if (sendPhotoBtn) sendPhotoBtn.style.display = 'none';

            // Request camera access
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment', // Use back camera if available
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            // Connect the stream to the video element
            if (cameraPreview) {
                cameraPreview.srcObject = stream;
                await cameraPreview.play();
                console.log("Camera opened successfully");

                if (statusElement) statusElement.textContent = 'Camera ready. Take a photo to analyze.';
            }
        } catch (error) {
            console.error("Camera error:", error);

            let errorMessage = 'Error accessing camera.';
            if (error.name === 'NotAllowedError') {
                errorMessage = 'Camera permission denied. Please enable camera access in your browser settings.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No camera found on your device.';
            } else if (error.name === 'NotReadableError') {
                errorMessage = 'Camera is in use by another application.';
            }

            if (statusElement) statusElement.textContent = errorMessage;
            alert(errorMessage);

            // Close the modal after displaying the error
            setTimeout(closeCamera, 1000);
        }
    }

    function closeCamera() {
        console.log("Closing camera...");
        // Stop the camera stream
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        // Reset the video element
        if (cameraPreview) {
            cameraPreview.srcObject = null;
        }

        // Hide the modal
        if (cameraModal) {
            cameraModal.classList.remove('active');
            cameraModal.style.display = 'none';
        }

        if (statusElement) statusElement.textContent = 'Camera closed.';
    }

    function takePhoto() {
        console.log("Taking photo...");
        if (!stream) return;

        try {
            // Get the video dimensions
            const width = cameraPreview.videoWidth;
            const height = cameraPreview.videoHeight;

            // Set canvas dimensions
            if (cameraCapture) {
                cameraCapture.width = width;
                cameraCapture.height = height;

                // Draw the video frame to the canvas
                const context = cameraCapture.getContext('2d');
                context.drawImage(cameraPreview, 0, 0, width, height);

                // Convert to data URL
                capturedImageData = cameraCapture.toDataURL('image/jpeg');

                // Display the captured image
                if (capturedImage) capturedImage.src = capturedImageData;
                if (cameraPreview) cameraPreview.style.display = 'none';
                if (capturedImageContainer) capturedImageContainer.style.display = 'block';

                // Update buttons
                if (takePhotoBtn) takePhotoBtn.style.display = 'none';
                if (retakePhotoBtn) retakePhotoBtn.style.display = 'inline-block';
                if (sendPhotoBtn) sendPhotoBtn.style.display = 'inline-block';

                if (statusElement) statusElement.textContent = 'Photo captured. Click "Send to AI" to analyze.';
                console.log("Photo taken successfully");
            }
        } catch (error) {
            console.error("Error taking photo:", error);
            if (statusElement) statusElement.textContent = 'Error taking photo: ' + error.message;
        }
    }

    function retakePhoto() {
        console.log("Retaking photo...");
        // Show camera preview again
        if (cameraPreview) cameraPreview.style.display = 'block';
        if (capturedImageContainer) capturedImageContainer.style.display = 'none';

        // Reset buttons
        if (takePhotoBtn) takePhotoBtn.style.display = 'inline-block';
        if (retakePhotoBtn) retakePhotoBtn.style.display = 'none';
        if (sendPhotoBtn) sendPhotoBtn.style.display = 'none';

        // Clear image data
        capturedImageData = null;
        if (capturedImage) capturedImage.src = '';

        if (statusElement) statusElement.textContent = 'Camera ready. Take a photo to analyze.';
    }

    async function sendPhotoToAI() {
        console.log("Sending photo to AI...");
        if (!capturedImageData) {
            if (statusElement) statusElement.textContent = 'No image captured. Please take a photo first.';
            return;
        }

        // Close camera
        closeCamera();

        // Clear previous responses
        if (aiResponseText) aiResponseText.innerHTML = '';

        // Update status
        const aiStatusElement = document.getElementById('ai-status');
        if (aiStatusElement) {
            aiStatusElement.style.display = 'block';
            aiStatusElement.className = 'ai-status loading';
            aiStatusElement.textContent = 'Analyzing image...';
        }

        try {
            // Convert base64 to blob for upload
            const base64Data = capturedImageData.split(',')[1];
            const blob = base64ToBlob(base64Data, 'image/jpeg');
            const imageFile = new File([blob], 'captured-image.jpg', { type: 'image/jpeg' });

            // Save to Puter cloud and get URL
            let imageUrl;
            if (isInitialized && typeof puter !== 'undefined' && puter.fs) {
                try {
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const filePath = `${PUTER_STORAGE_DIR}/image_${timestamp}.jpg`;

                    await puter.fs.write(filePath, imageFile, { createMissingParents: true });
                    imageUrl = await puter.fs.getUrl(filePath);
                    console.log('Image saved to cloud:', imageUrl);
                } catch (error) {
                    console.error('Error saving to cloud:', error);
                    imageUrl = URL.createObjectURL(blob);
                }
            } else {
                imageUrl = URL.createObjectURL(blob);
            }

            // Create container for the response
            const streamContainer = document.createElement('div');
            streamContainer.className = 'streaming-response interview-answer';
            if (aiResponseText) aiResponseText.appendChild(streamContainer);

            // Add image preview
            const imagePreview = document.createElement('div');
            imagePreview.className = 'analyzed-image-preview';
            imagePreview.innerHTML = `<img src="${capturedImageData}" style="max-width:300px; max-height:200px; border-radius:5px; margin-bottom:10px;">`;
            streamContainer.appendChild(imagePreview);

            try {
                // Direct analysis using GPT-4o Vision
                const response = await puter.ai.chat(
                    "What do you see in this image? Provide a direct and concise answer.",
                    imageUrl,
                    { model: 'gpt-4o' }
                );

                if (response && response.text) {
                    streamContainer.innerHTML += marked.parse(response.text);
                    enhanceCodeBlocks(streamContainer);
                    aiStatusElement.className = 'ai-status success';
                    aiStatusElement.textContent = 'Analysis complete!';

                    // Save to cloud if initialized
                    if (isInitialized) {
                        const timestamp = new Date().toISOString();
                        const id = `image_analysis_${timestamp.replace(/[:.]/g, '-')}`;
                        const data = {
                            id,
                            timestamp,
                            imageUrl,
                            aiResponse: response.text,
                            type: 'image_analysis'
                        };

                        await puter.fs.write(
                            `${PUTER_STORAGE_DIR}/${id}.json`,
                            JSON.stringify(data, null, 2),
                            { createMissingParents: true }
                        );
                    }
                }
            } catch (error) {
                console.error('Error analyzing with GPT-4o Vision:', error);
                throw error;
            }
        } catch (error) {
            console.error('Error in image analysis:', error);
            aiStatusElement.className = 'ai-status error';
            aiStatusElement.textContent = 'Error analyzing image: ' + (error.message || 'Unknown error');

            if (aiResponseText) {
                aiResponseText.innerHTML = `
                    <div class="error-message">
                        <p>Sorry, we couldn't analyze the image.</p>
                        <p>This could be due to:</p>
                        <ul>
                            <li>Temporary service interruption</li>
                            <li>Internet connectivity issues</li>
                            <li>Unsupported image format</li>
                        </ul>
                    </div>
                `;
            }
        }
    }

    // Helper function to convert base64 to blob
    function base64ToBlob(base64, mimeType) {
        const byteCharacters = atob(base64);
        const byteArrays = [];

        for (let offset = 0; offset < byteCharacters.length; offset += 512) {
            const slice = byteCharacters.slice(offset, offset + 512);

            const byteNumbers = new Array(slice.length);
            for (let i = 0; i < slice.length; i++) {
                byteNumbers[i] = slice.charCodeAt(i);
            }

            const byteArray = new Uint8Array(byteNumbers);
            byteArrays.push(byteArray);
        }

        return new Blob(byteArrays, { type: mimeType });
    }

    // Functions for mode switching
    function setAppMode(mode) {
        currentMode = mode;
        currentModeText.textContent = mode === 'standard' ? 'Standard Mode' : 'Meeting Assistant';

        if (mode === 'standard') {
            document.body.classList.remove('meeting-mode');
            document.body.classList.add('standard-mode');

            // Hide image analysis in standard mode
            imageAnalysisSection.style.display = 'none';

            // Hide header/top bar in standard mode
            const topBar = document.getElementById('top-bar');
            if (topBar) topBar.style.display = 'none';

            // Additional UI cleanup for standard mode
            const mainLayout = document.querySelector('.meeting-layout');
            if (mainLayout) {
                mainLayout.classList.add('standard-layout');
            }

            // Show only essential buttons in standard mode
            document.querySelectorAll('.meeting-only-btn').forEach(btn => {
                btn.style.display = 'none';
            });

            // Ensure the three core buttons are properly displayed
            startRecordButton.style.display = 'flex';
            clearTranscriptionButton.style.display = 'flex';

            stopScreenShare(); // Make sure to clean up any active meeting
        } else {
            document.body.classList.remove('standard-mode');
            document.body.classList.add('meeting-mode');

            // Show image analysis and header in meeting mode
            imageAnalysisSection.style.display = 'block';
            const topBar = document.getElementById('top-bar');
            if (topBar) topBar.style.display = 'flex';

            // Show all buttons in meeting mode
            document.querySelectorAll('.meeting-only-btn').forEach(btn => {
                btn.style.display = 'flex';
            });

            stopRecording(); // Make sure to clean up any active recording
        }

        // Clear panels
        transcriptionText.innerHTML = '';
        aiResponseText.innerHTML = '';

        // After clearing panels, load previous transcriptions for reference
        if (isInitialized) {
            displayPreviousTranscriptions();
        }

        // Update button sizes for current mode
        updateButtonSizesForMode();
    }

    // Check screen width and update UI accordingly
    function checkResponsiveLayout() {
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            document.body.classList.add('mobile-view');

            // Adjust the layout for mobile
            if (currentMode === 'standard') {
                // In standard mode on mobile, stack the controls vertically
                document.querySelectorAll('.controls .btn').forEach(btn => {
                    btn.style.width = '100%';
                    btn.style.marginBottom = '10px';
                });
            }
        } else {
            document.body.classList.remove('mobile-view');

            // Reset styles for desktop
            document.querySelectorAll('.controls .btn').forEach(btn => {
                if (currentMode === 'standard') {
                    btn.style.width = '100%';
                    btn.style.marginBottom = '10px';
                } else {
                    btn.style.width = '';
                    btn.style.marginBottom = '';
                }
            });
        }
    }

    // Update button sizes based on current mode
    function updateButtonSizesForMode() {
        if (currentMode === 'standard') {
            // Make buttons bigger in standard mode
            document.querySelectorAll('.controls .btn').forEach(btn => {
                btn.style.padding = '14px 28px';
                btn.style.fontSize = '16px';
                btn.style.width = '100%';
                btn.style.marginBottom = '10px';
                btn.style.justifyContent = 'center';
            });
        } else {
            // Normal buttons in meeting mode
            document.querySelectorAll('.controls .btn').forEach(btn => {
                btn.style.padding = '';
                btn.style.fontSize = '';
                btn.style.width = '';
                btn.style.marginBottom = '';
            });
        }

        // Additional checks for responsive layout
        checkResponsiveLayout();
    }

    // Standard mode functions
    function startRecording() {
        try {
            // Clear tracking of previous transcriptions on new recording session
            previousTranscriptions = new Set();
            // Don't clear the transcription panel - keep previous content
            recognitionStartTime = new Date().getTime();
            recognition.start();
            console.log("Recognition started");
            isRecording = true; // Explicitly set to true when starting
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            statusElement.textContent = 'Error starting speech recognition. Try again.';
        }
    }

    function stopRecording() {
        if (recognition) {
            recognition.stop();
            isRecording = false; // Explicitly set to false to prevent auto-restart
            console.log("Recognition stopped");
        }
    }

    // Meeting mode functions
    async function startScreenShare() {
        try {
            // Request screen capture with audio
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true
            });

            // Show the screen preview container
            const screenPreviewContainer = document.getElementById('screen-preview-floater');
            const screenVideo = document.getElementById('screen-video');

            if (screenPreviewContainer && screenVideo) {
                screenPreviewContainer.style.display = 'block';
                screenVideo.srcObject = screenStream;
            }

            // Start processing the audio for transcription
            setupAudioProcessing(screenStream);

            isMeetingRecording = true;
            statusElement.textContent = 'Screen and audio capture active. Live transcription enabled.';

            // Start recording for transcription
            startRecording();
            recordingDot.classList.add('active');

            // Add event listener for when stream ends (user clicks "Stop sharing")
            screenStream.getVideoTracks()[0].addEventListener('ended', () => {
                stopScreenShare();
                screenShareButton.innerHTML = '<i class="fas fa-desktop"></i> Share Screen';
                statusElement.textContent = 'Screen sharing stopped.';
            });

        } catch (error) {
            console.error('Error starting screen capture:', error);
            statusElement.textContent = 'Error starting screen capture. You may need to grant permission.';
        }
    }

    function stopScreenShare() {
        if (isMeetingRecording) {
            // Stop the screen sharing
            if (screenStream) {
                screenStream.getTracks().forEach(track => track.stop());
            }

            // Hide the screen preview container
            const screenPreviewContainer = document.getElementById('screen-preview-floater');
            if (screenPreviewContainer) {
                screenPreviewContainer.style.display = 'none';
            }

            // Stop the audio processing
            stopAudioProcessing();

            // Stop automatic processing
            stopAutoProcessing();

            // Stop the speech recognition
            stopRecording();
            recordingDot.classList.remove('active');

            // Process any remaining transcription
            const completeTranscription = getCompleteTranscription();
            if (completeTranscription) {
                processWithAI(completeTranscription);
            }

            isMeetingRecording = false;
            statusElement.textContent = 'Screen sharing stopped.';
        }
    }

    function setupAudioProcessing(stream) {
        try {
            // Create audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Get audio track from the screen capture stream
            const audioTrack = stream.getAudioTracks()[0];

            if (!audioTrack) {
                console.warn('No audio track found in the stream');
                statusElement.textContent = 'No audio detected in screen share. Make sure to choose "Share audio" in the dialog.';
                startStatusBlink(); // Visual indicator that audio is missing
                return;
            }

            // Create a MediaStreamSource from the audio track
            const audioSource = audioContext.createMediaStreamSource(new MediaStream([audioTrack]));

            // Create an AudioAnalyser to visualize sound if needed
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            audioSource.connect(analyser);

            // Create a processor node for custom audio processing
            const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

            // Setup audio processing for screen share
            scriptNode.onaudioprocess = function (audioProcessingEvent) {
                // Here we could add additional audio processing like noise suppression
                // but for now we're just using the Web Speech API for transcription 

                // Get the audio data
                const inputBuffer = audioProcessingEvent.inputBuffer;

                // Detect if there's meaningful audio (not just silence)
                const inputData = inputBuffer.getChannelData(0);
                const soundDetected = detectSound(inputData);

                if (soundDetected) {
                    // Visual indicator that sound is being detected
                    recordingDot.classList.add('active');
                } else {
                    // No sound detected
                    recordingDot.classList.remove('active');
                }
            };

            // Connect the nodes
            audioSource.connect(scriptNode);
            scriptNode.connect(audioContext.destination);

            streamProcessor = scriptNode;

            // Set up auto-processing of transcription for meeting mode
            if (currentMode === 'meeting' && settings.meetingMode.processingType === 'continuous') {
                setupAutoProcessing();
            }

            statusElement.textContent = 'Screen sharing with audio capture active. Live transcription enabled.';

        } catch (error) {
            console.error('Error setting up audio processing:', error);
            statusElement.textContent = 'Error processing audio from screen capture.';
        }
    }

    // Detect if there's meaningful sound in the audio data
    function detectSound(audioData) {
        // Calculate average volume level
        let sum = 0;
        for (let i = 0; i < audioData.length; i++) {
            sum += Math.abs(audioData[i]);
        }
        const averageVolume = sum / audioData.length;

        // Threshold for considering it as actual sound vs background noise
        const threshold = settings.energyThreshold / 10000; // Adjust based on settings

        return averageVolume > threshold;
    }

    // Visual indicator that audio might be missing from screen share
    function startStatusBlink() {
        statusElement.classList.add('blink-warning');
        setTimeout(() => {
            statusElement.classList.remove('blink-warning');
        }, 10000); // Stop blinking after 10 seconds
    }

    function stopAudioProcessing() {
        if (streamProcessor) {
            streamProcessor.disconnect();
            streamProcessor = null;
        }

        if (audioContext) {
            audioContext.close().catch(e => console.error('Error closing audio context:', e));
            audioContext = null;
        }
    }

    function setupAutoProcessing() {
        // Clear any existing timer
        stopAutoProcessing();

        // Set up new timer for periodically processing transcriptions
        autoProcessTimer = setInterval(() => {
            const latestTranscription = getLatestTranscription();
            if (latestTranscription && latestTranscription.trim().split(' ').length > 10) {
                // Clear previous AI responses before processing new transcription
                aiResponseText.innerHTML = '';
                processWithAI(latestTranscription);
            }
        }, settings.meetingMode.autoProcessInterval * 1000);
    }

    function scheduleAutoProcessing() {
        // Only schedule if not already scheduled
        if (!autoProcessTimer && currentMode === 'meeting' && isMeetingRecording) {
            setupAutoProcessing();
        }
    }

    function stopAutoProcessing() {
        if (autoProcessTimer) {
            clearInterval(autoProcessTimer);
            autoProcessTimer = null;
        }
    }

    function getCompleteTranscription() {
        const finalTranscriptions = transcriptionText.getElementsByClassName('transcription-final');
        let completeText = '';

        for (let i = 0; i < finalTranscriptions.length; i++) {
            completeText += finalTranscriptions[i].textContent + ' ';
        }

        return completeText.trim();
    }

    // Function to get only the latest transcription based on the current recording session
    function getLatestTranscription() {
        const finalTranscriptions = transcriptionText.getElementsByClassName('transcription-final');

        // If no transcriptions, return empty
        if (finalTranscriptions.length === 0) return '';

        // We'll collect only transcriptions added in the current session
        let latestText = '';

        for (let i = 0; i < finalTranscriptions.length; i++) {
            const element = finalTranscriptions[i];
            // Check if this is from the current recording session (has data-session attribute)
            if (element.getAttribute('data-session') === recognitionStartTime.toString()) {
                // Extract just the content, not the timestamp
                const contentElement = element.querySelector('.transcription-content');
                if (contentElement) {
                    latestText += contentElement.textContent + ' ';
                }
            }
        }

        return latestText.trim();
    }

    // Process the transcription with AI
    async function processWithAI(transcription) {
        if (!transcription || transcription.trim() === '') {
            return;
        }

        const aiStatusElement = document.getElementById('ai-status');
        aiStatusElement.style.display = 'block';
        aiStatusElement.className = 'ai-status loading';
        aiStatusElement.textContent = 'Processing with AI...';

        // Clear previous response
        aiResponseText.innerHTML = '';

        try {
            // Create container for the response
            const streamContainer = document.createElement('div');
            streamContainer.className = 'streaming-response interview-answer';
            aiResponseText.appendChild(streamContainer);

            // Format the prompt to get interview-style responses with proper code highlighting
            const formattedPrompt = `You are simulating a formal interview setting. Respond in a **professional**, **clear**, and **concise** tone. Elaborate when necessary, but maintain a structured and easy-to-read flow. Make sure to **bold** all important keywords, technical terms, and key takeaways within the response. Begin with a short, confident introduction if appropriate. Keep the balance between being **brief** and **thorough** — expand only when it truly adds value. Avoid casual language; maintain a formal and articulate style throughout. Format your response exactly like an interview answer and also answer as you are saying to the interviewer and also bold some sentences which are much needed to stress out. 

If you include code examples, make sure to clearly specify the language for each code block by using the format \`\`\`language-name. Add meaningful comments in the code to explain the logic. Here is the question or topic you need to address:"${transcription}"`;

            // First try using Puter AI if available
            if (typeof window.puter !== 'undefined' && window.puter.ai && typeof window.puter.ai.chat === 'function') {
                aiStatusElement.textContent = 'Generating response as if answering an interview question...';

                try {
                    // Try streaming response with Puter AI
                    const response = await window.puter.ai.chat(
                        formattedPrompt,
                        { model: currentModel, stream: true }
                    );

                    let fullResponse = '';

                    // Process each part of the stream
                    for await (const part of response) {
                        if (part?.text) {
                            fullResponse += part.text;
                            // Update the UI with the markdown-parsed response
                            streamContainer.innerHTML = marked.parse(fullResponse);

                            // Apply syntax highlighting to code blocks
                            enhanceCodeBlocks(streamContainer);

                            // Scroll to show the latest content
                            aiResponseText.scrollTop = aiResponseText.scrollHeight;
                        }
                    }

                    // Mark the response as complete
                    streamContainer.classList.add('done');

                    // Save the response to session storage
                    try {
                        sessionStorage.setItem('lastAIResponse', fullResponse);

                        // Save to Puter cloud
                        if (isInitialized) {
                            await saveToCloud(transcription, fullResponse);

                            // Refresh the transcription list to show the new entry
                            await displayPreviousTranscriptions();
                        }
                    } catch (storageError) {
                        console.log('Could not store response in storage:', storageError);
                    }

                    aiStatusElement.className = 'ai-status success';
                    aiStatusElement.textContent = 'Response complete!';
                    return; // Exit function if successful
                } catch (streamError) {
                    console.warn('Streaming response failed, trying non-streaming API:', streamError);

                    // Try non-streaming API as fallback
                    try {
                        const nonStreamResponse = await window.puter.ai.chat(
                            formattedPrompt,
                            { model: currentModel, stream: false }
                        );

                        if (nonStreamResponse && nonStreamResponse.text) {
                            streamContainer.innerHTML = marked.parse(nonStreamResponse.text);

                            // Apply enhanced syntax highlighting
                            enhanceCodeBlocks(streamContainer);

                            streamContainer.classList.add('done');
                            aiStatusElement.className = 'ai-status success';
                            aiStatusElement.textContent = 'Response complete!';

                            // Save response
                            try {
                                sessionStorage.setItem('lastAIResponse', nonStreamResponse.text);

                                // Save to Puter cloud
                                if (isInitialized) {
                                    await saveToCloud(transcription, nonStreamResponse.text);

                                    // Refresh the transcription list to show the new entry
                                    await displayPreviousTranscriptions();
                                }
                            } catch (storageError) {
                                console.log('Could not store response in storage:', storageError);
                            }
                            return; // Exit function if successful
                        }
                    } catch (nonStreamError) {
                        console.error('Non-streaming API also failed:', nonStreamError);
                    }
                }
            }

            // If we get here, there was a problem with the AI
            aiStatusElement.className = 'ai-status error';
            aiStatusElement.textContent = 'Could not connect to AI service';

            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-message';
            errorMessage.innerHTML = `
                <p>Sorry, we couldn't generate a response with the AI service.</p>
                <p>This could be due to:</p>
                <ul>
                    <li>Temporary service interruption</li>
                    <li>Internet connectivity issues</li>
                    <li>The API may not be available</li>
                </ul>
                <p>Please try again in a few moments.</p>
            `;
            streamContainer.appendChild(errorMessage);

        } catch (error) {
            console.error('Error processing with AI:', error);

            aiStatusElement.className = 'ai-status error';
            aiStatusElement.textContent = 'AI processing error: ' + (error.message || 'Unknown error');

            const retryButton = document.createElement('button');
            retryButton.className = 'btn primary';
            retryButton.textContent = 'Retry Analysis';
            retryButton.addEventListener('click', () => processWithAI(transcription));
            aiResponseText.innerHTML = '';
            aiResponseText.appendChild(retryButton);
        }
    }

    // New function to enhance code blocks with VS Code-like styling
    function enhanceCodeBlocks(container) {
        if (!container) return;

        // Find all code blocks
        const codeBlocks = container.querySelectorAll('pre code');

        for (const codeBlock of codeBlocks) {
            // Apply syntax highlighting if hljs is available
            if (typeof hljs !== 'undefined') {
                hljs.highlightBlock(codeBlock);
            }

            // Add line numbers
            if (!codeBlock.parentElement.classList.contains('code-with-line-numbers')) {
                codeBlock.parentElement.classList.add('code-with-line-numbers');
            }

            // Extract language from class (hljs adds language classes like language-js)
            let language = 'text';
            const languageClass = Array.from(codeBlock.classList).find(cls => cls.startsWith('language-'));
            if (languageClass) {
                language = languageClass.replace('language-', '');
            } else {
                // Try to detect language from hljs class if language- wasn't specified
                const hljsClass = Array.from(codeBlock.classList).find(cls => cls.startsWith('hljs-'));
                if (hljsClass) {
                    // Extract potential language from hljs class
                    const detectedLang = codeBlock.className.match(/language-(\w+)/);
                    if (detectedLang && detectedLang[1]) {
                        language = detectedLang[1];
                    }
                }
            }

            // Map common short language names to their full display names
            const languageDisplayNames = {
                'js': 'JavaScript',
                'ts': 'TypeScript',
                'py': 'Python',
                'rb': 'Ruby',
                'java': 'Java',
                'csharp': 'C#',
                'cs': 'C#',
                'cpp': 'C++',
                'php': 'PHP',
                'go': 'Go',
                'rust': 'Rust',
                'html': 'HTML',
                'css': 'CSS',
                'json': 'JSON',
                'xml': 'XML',
                'md': 'Markdown',
                'sql': 'SQL',
                'bash': 'Bash',
                'sh': 'Shell',
                'yaml': 'YAML',
                'yml': 'YAML',
                'dockerfile': 'Dockerfile',
                'docker': 'Dockerfile'
            };

            // Get friendly language name for display
            const displayLanguage = languageDisplayNames[language] || language.charAt(0).toUpperCase() + language.slice(1);

            // Set language indicator attribute with a more user-friendly name
            if (!codeBlock.parentElement.hasAttribute('data-language')) {
                codeBlock.parentElement.setAttribute('data-language', displayLanguage);
            }

            // Add VSCode-style title bar with language icon
            if (!codeBlock.parentElement.querySelector('.code-title-bar')) {
                const titleBar = document.createElement('div');
                titleBar.className = 'code-title-bar';
                titleBar.innerHTML = `
                    <span class="code-language-icon ${language}"></span>
                    <span class="code-language-name">${displayLanguage}</span>
                    <div class="code-title-actions">
                        <button class="code-copy-btn" title="Copy to clipboard">
                            <i class="fas fa-copy"></i>
                        </button>
                    </div>
                `;
                codeBlock.parentElement.insertBefore(titleBar, codeBlock);

                // Add copy functionality
                const copyBtn = titleBar.querySelector('.code-copy-btn');
                copyBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                        const originalTitle = copyBtn.title;
                        copyBtn.title = "Copied!";
                        copyBtn.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            copyBtn.title = originalTitle;
                            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 2000);
                    });
                });
            }

            // Add a subtle line highlight effect on hover rows
            if (!codeBlock.querySelector('.line-highlight-overlay')) {
                const lines = codeBlock.textContent.split('\n').length;
                const overlay = document.createElement('div');
                overlay.className = 'line-highlight-overlay';
                for (let i = 0; i < lines; i++) {
                    const line = document.createElement('div');
                    line.className = 'hljs-line';
                    line.setAttribute('data-line', i + 1);
                    overlay.appendChild(line);
                }
                codeBlock.appendChild(overlay);
            }
        }
    }

    function saveSettings() {
        const languageSelect = document.getElementById('language');
        if (languageSelect) {
            settings.language = languageSelect.value;
        }

        const saveTranscriptionsCheck = document.getElementById('saveTranscriptions');
        if (saveTranscriptionsCheck) {
            settings.saveTranscriptions = saveTranscriptionsCheck.checked;
        }

        const timeoutInput = document.getElementById('timeout');
        if (timeoutInput) {
            settings.timeout = parseInt(timeoutInput.value);
        }

        const energyThresholdInput = document.getElementById('energyThreshold');
        if (energyThresholdInput) {
            settings.energyThreshold = parseInt(energyThresholdInput.value);
        }

        const useVoiceCloningCheck = document.getElementById('useVoiceCloning');
        if (useVoiceCloningCheck) {
            settings.useVoiceCloning = useVoiceCloningCheck.checked;
        }

        const aiModelSelect = document.getElementById('aiModel');
        if (aiModelSelect) {
            currentModel = aiModelSelect.value;
        }

        if (recognition) {
            recognition.lang = settings.language;
        }

        localStorage.setItem('appSettings', JSON.stringify(settings));

        statusElement.textContent = 'Settings saved!';
        setTimeout(() => {
            statusElement.textContent = 'Ready';
        }, 2000);
    }

    function loadSavedData() {
        try {
            const savedSettings = localStorage.getItem('appSettings');
            if (savedSettings) {
                const parsedSettings = JSON.parse(savedSettings);
                settings = { ...settings, ...parsedSettings };
            }

            const savedHistory = localStorage.getItem('transcriptionHistory');
            if (savedHistory) {
                transcriptionHistory = JSON.parse(savedHistory);
            }

            const lastResponse = sessionStorage.getItem('lastAIResponse');
            if (lastResponse && aiResponseText) {
                aiResponseText.innerHTML = marked.parse(lastResponse);

                // Apply enhanced code block styling when loading saved responses
                enhanceCodeBlocks(aiResponseText);
            }
        } catch (error) {
            console.log('Error loading saved data:', error);
        }
    }

    // This function populates the settings form with the current settings
    function populateSettingsForm() {
        if (!document.getElementById('language')) return; // Skip if elements don't exist yet

        document.getElementById('language').value = settings.language;

        if (document.getElementById('saveTranscriptions')) {
            document.getElementById('saveTranscriptions').checked = settings.saveTranscriptions;
        }

        if (document.getElementById('timeout')) {
            document.getElementById('timeout').value = settings.timeout;
        }

        if (document.getElementById('energyThreshold')) {
            document.getElementById('energyThreshold').value = settings.energyThreshold;
        }

        if (document.getElementById('useVoiceCloning')) {
            document.getElementById('useVoiceCloning').checked = settings.useVoiceCloning;
        }

        if (document.getElementById('aiModel')) {
            document.getElementById('aiModel').value = currentModel;
        }
    }

    // Copy buttons functionality
    const copyTranscriptionBtn = document.getElementById('copy-transcription');
    const copyResponseBtn = document.getElementById('copy-response');

    if (copyTranscriptionBtn) {
        copyTranscriptionBtn.addEventListener('click', function () {
            const text = getCompleteTranscription();
            copyToClipboard(text);
            statusElement.textContent = 'Transcription copied to clipboard!';
        });
    }

    if (copyResponseBtn) {
        copyResponseBtn.addEventListener('click', function () {
            const text = aiResponseText.innerText;
            copyToClipboard(text);
            statusElement.textContent = 'Response copied to clipboard!';
        });
    }

    function copyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }

    loadSavedData();
    populateSettingsForm();

    // Initial check for responsive layout
    checkResponsiveLayout();

    // Listen for window resize events to update the responsive layout
    window.addEventListener('resize', function () {
        checkResponsiveLayout();
    });
});

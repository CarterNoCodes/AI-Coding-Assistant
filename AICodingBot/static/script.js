document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const newChatBtn = document.getElementById('new-chat-btn');
    const previousChats = document.getElementById('previous-chats');
    const fileUpload = document.getElementById('file-upload');
    const languageSelect = document.getElementById('language-select');

    let currentChatId = Date.now();
    let conversationHistory = [];

    sendBtn.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    newChatBtn.addEventListener('click', startNewChat);
    fileUpload.addEventListener('change', handleFileUpload);

    function sendMessage() {
        const message = userInput.value.trim();
        const selectedLanguage = languageSelect.value;

        if (message) {
            addMessage('user', message);
            userInput.value = '';

            // Add user message to conversation history
            conversationHistory.push({ role: 'user', content: message });

            // Prepare the prompt for code generation
            let prompt = `Generate ${selectedLanguage} code for the following task: ${message}`;

            // Send user input to Flask API
            fetch('http://127.0.0.1:5000/generate_code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    prompt: message,
                    language: selectedLanguage,
                    conversation_history: conversationHistory
                })
            })
            .then(response => {
                if (!response.ok) {
                    console.error('API response error:', response);
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                console.log('API Response:', data);
                // Handle data...
            })
            .catch(error => {
                console.error('Fetch Error:', error);
                addMessage('bot', "Sorry, something went wrong.");
            });
        }
    }
    
    function addMessage(sender, content, language = 'plaintext') {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', `${sender}-message`);

        const textElement = document.createElement('div');
        textElement.classList.add('message-text');

        if (sender === 'bot') {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.classList.add(`language-${language}`);
            code.textContent = content;
            pre.appendChild(code);
            textElement.appendChild(pre);
        } else {
            textElement.textContent = content;
        }

        messageElement.appendChild(textElement);

        const copyButton = document.createElement('button');
        copyButton.classList.add('copy-button');
        copyButton.innerHTML = '<i class="material-icons">content_copy</i>';
        copyButton.addEventListener('click', () => copyToClipboard(content));
        messageElement.appendChild(copyButton);

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Apply syntax highlighting
        Prism.highlightElement(textElement.querySelector('code'));
    }

    function addFeedbackOptions(prompt, generatedCode) {
        const feedbackDiv = document.createElement('div');
        feedbackDiv.classList.add('feedback-options');
        
        const ratingInput = document.createElement('input');
        ratingInput.type = 'number';
        ratingInput.min = 1;
        ratingInput.max = 5;
        ratingInput.placeholder = 'Rate (1-5)';

        const correctionInput = document.createElement('textarea');
        correctionInput.placeholder = 'Suggest improvements (optional)';
        
        const submitButton = document.createElement('button');
        submitButton.textContent = 'Submit Feedback';
        submitButton.addEventListener('click', () => {
            submitFeedback(prompt, generatedCode, ratingInput.value, correctionInput.value);
        });

        feedbackDiv.appendChild(ratingInput);
        feedbackDiv.appendChild(correctionInput);
        feedbackDiv.appendChild(submitButton);
        chatMessages.appendChild(feedbackDiv);
    }

    function submitFeedback(prompt, generatedCode, rating, correction) {
        fetch('http://127.0.0.1:5000/submit_feedback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                generated_code: generatedCode,
                rating: rating,
                correction: correction
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                console.log('Feedback submitted successfully');
                addMessage('bot', 'Thank you for your feedback!');
            }
        })
        .catch(error => {
            console.error('Error submitting feedback:', error);
        });
    }

    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            const copiedMessage = document.createElement('div');
            copiedMessage.textContent = 'Copied!';
            copiedMessage.classList.add('copied-message');
            document.body.appendChild(copiedMessage);
            setTimeout(() => {
                copiedMessage.remove();
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    }

    function startNewChat() {
        currentChatId = Date.now();
        chatMessages.innerHTML = '';
        conversationHistory = [];
        addChatToSidebar(currentChatId, 'New Chat');
    }

    function addChatToSidebar(id, title) {
        const chatItem = document.createElement('div');
        chatItem.classList.add('chat-item');
        chatItem.textContent = title;
        chatItem.dataset.chatId = id;
        chatItem.addEventListener('click', () => loadChat(id));
        previousChats.prepend(chatItem);
    }

    function loadChat(id) {
        console.log(`Loading chat ${id}`);
        // Implement chat loading logic here
    }

    function handleFileUpload(event) {
        const files = event.target.files;
        for (let file of files) {
            addMessage('user', `Uploaded file: ${file.name}`);
            console.log(`File uploaded: ${file.name}`);
        }
    }

    startNewChat();
});
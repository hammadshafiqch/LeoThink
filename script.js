/**
 * ========================================
 * LEOTHINK - OPENROUTER INTEGRATION
 * Streams responses using OpenRouter API
 * ========================================
 */

document.addEventListener('DOMContentLoaded', function() {
    // ---------- DOM Elements ----------
    const chatContainer = document.querySelector('.gradient-chat');
    const chatMessages = document.getElementById('chatMessages');
    const userInput = document.getElementById('userInput');
    const sendBtn = document.getElementById('sendBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    const closeBtn = document.getElementById('closeBtn');

    // ---------- Configuration ----------
    // WARNING: Never expose your API key in production client-side code.
    // This is for local testing only.
    const OPENROUTER_API_KEY = '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';
    const MODEL = 'deepseek/deepseek-v3.2';  // or any model you prefer

    // Get custom logo details from the header (so you only need to change it in HTML)
    const logoLink = document.querySelector('.logo-link')?.href || '#';
    const logoSrc = document.querySelector('.custom-logo')?.src || '';

    // ---------- Helper: Add message to chat ----------
    function addMessage(text, sender, isStreaming = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender);
        if (isStreaming) messageDiv.classList.add('streaming');

        // Avatar
        if (sender === 'bot') {
            const avatarLink = document.createElement('a');
            avatarLink.href = logoLink;
            avatarLink.target = '_blank';
            avatarLink.classList.add('avatar');
            const avatarImg = document.createElement('img');
            avatarImg.src = logoSrc;
            avatarImg.alt = 'leothink logo';
            avatarLink.appendChild(avatarImg);
            messageDiv.appendChild(avatarLink);
        } else {
            const avatarDiv = document.createElement('div');
            avatarDiv.classList.add('avatar');
            avatarDiv.textContent = '👤';
            messageDiv.appendChild(avatarDiv);
        }

        // Bubble
        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = text;
        messageDiv.appendChild(bubble);

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        return messageDiv; // return for later updates (streaming)
    }

    // ---------- Helper: Update streaming message ----------
    function updateMessage(messageDiv, newText) {
        const bubble = messageDiv.querySelector('.bubble');
        if (bubble) {
            bubble.textContent = newText;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    }

    // ---------- Helper: Show typing indicator ----------
    function showTypingIndicator() {
        const indicatorDiv = document.createElement('div');
        indicatorDiv.classList.add('message', 'bot', 'typing');
        indicatorDiv.id = 'typing-indicator';

        const avatarLink = document.createElement('a');
        avatarLink.href = logoLink;
        avatarLink.target = '_blank';
        avatarLink.classList.add('avatar');
        const avatarImg = document.createElement('img');
        avatarImg.src = logoSrc;
        avatarImg.alt = 'leothink logo';
        avatarLink.appendChild(avatarImg);
        indicatorDiv.appendChild(avatarLink);

        const bubble = document.createElement('div');
        bubble.classList.add('bubble');
        bubble.textContent = ''; // will show ... via CSS
        indicatorDiv.appendChild(bubble);

        chatMessages.appendChild(indicatorDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    }

    // ---------- Core: Send message to OpenRouter with streaming ----------
    async function sendMessageToOpenRouter(userMessage) {
        // Add user message to UI
        addMessage(userMessage, 'user');

        // Show typing indicator
        showTypingIndicator();

        // Prepare the API request
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'HTTP-Referer': window.location.origin, // Optional, for rankings
                'X-Title': 'leothink Chatbot'           // Optional, for rankings
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    { role: 'user', content: userMessage }
                ],
                stream: true
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            removeTypingIndicator();
            addMessage(`Error: ${response.status} - ${errorText}`, 'bot');
            return;
        }

        // Remove typing indicator
        removeTypingIndicator();

        // Create a placeholder bot message for streaming
        const botMessageDiv = addMessage('', 'bot', true);

        // Read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullContent = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the last incomplete line

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed === 'data: [DONE]') continue;

                    if (trimmed.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(trimmed.slice(6));
                            const content = data.choices[0]?.delta?.content || '';
                            if (content) {
                                fullContent += content;
                                updateMessage(botMessageDiv, fullContent);
                            }

                            // If usage info is present (final chunk), log or display it
                            if (data.usage) {
                                console.log('Reasoning tokens:', data.usage.reasoning_tokens);
                                // Optional: show in UI as a small note
                                const usageNote = document.createElement('div');
                                usageNote.style.fontSize = '0.7rem';
                                usageNote.style.color = '#aaccff';
                                usageNote.style.marginTop = '0.2rem';
                                usageNote.textContent = `(reasoning tokens: ${data.usage.reasoning_tokens || 0})`;
                                botMessageDiv.querySelector('.bubble').after(usageNote);
                            }
                        } catch (e) {
                            console.warn('Failed to parse chunk:', trimmed, e);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Stream reading error:', error);
            updateMessage(botMessageDiv, 'Sorry, an error occurred while streaming.');
        } finally {
            reader.releaseLock();
        }
    }

    // ---------- Event Handlers ----------
    function handleSend() {
        const message = userInput.value.trim();
        if (message === '') return;

        // Disable input and button while processing
        userInput.disabled = true;
        sendBtn.disabled = true;

        // Clear input
        userInput.value = '';

        // Send to OpenRouter
        sendMessageToOpenRouter(message).finally(() => {
            // Re-enable input and button
            userInput.disabled = false;
            sendBtn.disabled = false;
            userInput.focus();
        });
    }

    // Minimize / close
    function toggleMinimize() {
        chatContainer.classList.toggle('minimized');
        minimizeBtn.innerHTML = chatContainer.classList.contains('minimized') ? '□' : '−';
    }

    function handleClose() {
        if (!chatContainer.classList.contains('minimized')) {
            toggleMinimize();
        }
    }

    // ---------- Event Listeners ----------
    sendBtn.addEventListener('click', handleSend);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSend();
        }
    });
    minimizeBtn.addEventListener('click', toggleMinimize);
    closeBtn.addEventListener('click', handleClose);

    // Focus input on load
    userInput.focus();

    // Add a welcome message
    setTimeout(() => {
        addMessage('Hello! I\'m leothink, powered by Ch Hammad. Ask me anything!', 'bot');
    }, 100);
});
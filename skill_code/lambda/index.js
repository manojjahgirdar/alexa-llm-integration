const Alexa = require('ask-sdk-core');
const request = require('sync-request');
const { OPENAI_API_KEY } = require('./config');
const { SYSTEM_PROMPT } = require('./prompts');

function sanitizeForAlexa(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/#{1,6}\s+/g, '')
        .replace(/`{1,3}[^`]*`{1,3}/g, '')
        .replace(/[-•]\s+/g, '')
        .replace(/\n{2,}/g, '. ')
        .replace(/\n/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        sessionAttributes.conversationHistory = [];
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        const speakOutput = 'Spell the secret code to start Jarvis.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('I am listening, sir.')
            .getResponse();
    }
};

const InProgressHelloWorldIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelloWorldIntent'
            && handlerInput.requestEnvelope.request.dialogState !== 'COMPLETED';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .addDelegateDirective()
            .getResponse();
    }
};

const HelloWorldIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelloWorldIntent'
            && handlerInput.requestEnvelope.request.dialogState === 'COMPLETED';
    },
    handle(handlerInput) {
        let speakOutput = 'I could not process that. Please try again, sir.';

        const slots = handlerInput.requestEnvelope.request.intent.slots;
        const catchAllValue = slots && slots.catchAll && slots.catchAll.value;
        console.log('User Input:', catchAllValue);

        if (!catchAllValue) {
            return handlerInput.responseBuilder
                .speak('I did not catch that. Could you please repeat?')
                .reprompt('I am listening, sir.')
                .getResponse();
        }

        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        if (!sessionAttributes.conversationHistory) {
            sessionAttributes.conversationHistory = [];
        }

        sessionAttributes.conversationHistory.push({
            role: 'user',
            content: catchAllValue
        });

        function makeSyncPostRequest() {
            try {
                const response = request('POST', 'https://api.groq.com/openai/v1/chat/completions', {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + OPENAI_API_KEY,
                    },
                    body: JSON.stringify({
                        "model": "openai/gpt-oss-120b",
                        "messages": [
                            { "role": "system", "content": SYSTEM_PROMPT },
                            ...sessionAttributes.conversationHistory
                        ]
                    })
                });

                if (response.statusCode === 200) {
                    const parsed = JSON.parse(response.getBody('utf8'));
                    const rawResponse = parsed.choices[0].message.content;
                    speakOutput = sanitizeForAlexa(rawResponse);
                    console.log('Jarvis Response:', speakOutput);

                    sessionAttributes.conversationHistory.push({
                        role: 'assistant',
                        content: rawResponse
                    });

                    if (sessionAttributes.conversationHistory.length > 20) {
                        sessionAttributes.conversationHistory = 
                            sessionAttributes.conversationHistory.slice(-20);
                    }

                    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

                } else {
                    console.error('Failed with status code:', response.statusCode);
                    speakOutput = 'My systems encountered an issue. Please try again, sir.';
                }
            } catch (error) {
                console.error('Error:', error.message);
                speakOutput = 'Something went wrong. Please try again, sir.';
            }
        }

        makeSyncPostRequest();

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('I am listening, sir.')
            .addElicitSlotDirective('catchAll', {
                name: 'HelloWorldIntent',
                confirmationStatus: 'NONE',
                slots: {
                    catchAll: {
                        name: 'catchAll',
                        confirmationStatus: 'NONE'
                    }
                }
            })
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Just tell me what you need, sir. I am always listening.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('I am listening, sir.')
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye, sir. Jarvis signing off.';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        return handlerInput.responseBuilder
            .speak('I did not catch that, sir. Could you rephrase?')
            .reprompt('I am listening, sir.')
            .addElicitSlotDirective('catchAll', {
                name: 'HelloWorldIntent',
                confirmationStatus: 'NONE',
                slots: {
                    catchAll: {
                        name: 'catchAll',
                        confirmationStatus: 'NONE'
                    }
                }
            })
            .getResponse();
    }
};

const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        return handlerInput.responseBuilder.getResponse();
    }
};

const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You triggered ${intentName}`;
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};

const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Sorry sir, I had trouble with that. Please try again.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt('I am listening, sir.')
            .getResponse();
    }
};

exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        InProgressHelloWorldIntentHandler,
        HelloWorldIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .withCustomUserAgent('sample/jarvis/v1.2')
    .lambda();
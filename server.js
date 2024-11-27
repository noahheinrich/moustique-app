const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();
const server = http.createServer(app);

require('dotenv').config({ path: './config/.env' });

// Configuration CORS
app.use(cors({
    origin: 'http://localhost:3000',  // Adresse de l'application React
}));

const io = new Server(server, {
    cors: {
        origin: 'http://localhost:3000',
        methods: ['GET', 'POST'],
    },
});

// Paramètres de connexion MQTT
const protocol = 'mqtts';
const host = process.env.MQTT_HOST;
const port = process.env.MQTT_PORT;
const clientId = `mqtt_${Math.random().toString(16).slice(3)}`;
const connectUrl = `${protocol}://${host}:${port}`;

// Nouvelle instance du client MQTT
const mqttClient = mqtt.connect(connectUrl, {
    clientId,
    clean: true,
    connectTimeout: 4000,
    username: process.env.MQTT_USER,
    password: process.env.MQTT_KEY,
});

// Topics MQTT
const topicUp = `v3/${process.env.MQTT_USER}/devices/+/up`; // Topic pour la réception de données
const topicDown = `v3/${process.env.MQTT_USER}/devices/${process.env.DEVICE_ID}/down/push`; // Topic pour l'envoi de commandes

mqttClient.on('connect', () => {
    console.log('Connecté au broker MQTT');
    mqttClient.subscribe(topicUp, (err) => {
        if (err) {
            console.error('Erreur de souscription au topic:', err);
        } else {
            console.log(`Souscrit au topic '${topicUp}' avec succès`);
        }
    });
});

mqttClient.on('error', (error) => {
    console.error('Erreur de connexion au broker MQTT:', error);
});

// Événement lorsqu'un message est reçu sur le topic "up" (données du capteur)
mqttClient.on('message', (topic, message) => {
    try {
        const parsedMessage = JSON.parse(message.toString());
        if (parsedMessage.uplink_message && parsedMessage.uplink_message.decoded_payload) {
            const bytes = parsedMessage.uplink_message.decoded_payload.bytes;
            console.log('Bytes reçus:', bytes);
            io.emit('mqttData', bytes); // Transmission des données au client React
        } else {
            console.error('Erreur: Données MQTT incorrectes ou absentes.');
        }
    } catch (error) {
        console.error('Erreur de parsing JSON:', error.message);
    }
});

// Écouter les commandes venant de React
io.on('connection', (socket) => {
    console.log('Client React est connecté');

    // Lorsqu'une commande de toggle est reçue pour le ventilateur
    socket.on('toggleFan', (data) => {
        const fanStatus = data.isOn ? 1 : 0; // 1 pour ON, 0 pour OFF
        const buffer = Buffer.from(fanStatus.toString());
        const mess = buffer.toString('base64');
        const message = {
            downlinks:
                [{
                    f_port: 15,
                    frm_payload: mess,
                    priority: 'NORMAL'
                }]
        };
       

        // Envoi de la commande via MQTT
        mqttClient.publish(topicDown, JSON.stringify(message), (error) => {
            if (error) {
                console.error('Erreur d\'envoi MQTT:', error);
            } else {
                console.log('Commande envoyée au ventilateur:', message);
            }
        });
    });
});

// Endpoint de test
app.get('/', (req, res) => {
    res.send('Le serveur Node.js fonctionne correctement');
});

server.listen(3001, () => {
    console.log('Serveur Node.js en écoute sur le port 3001');
});

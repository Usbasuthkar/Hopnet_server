const express = require('express');
const cors = require('cors');
const { createServer } = require('node:http');
const mongodb = require('mongodb');
const axios = require('axios');
require('dotenv').config();

const client = new mongodb.MongoClient(process.env.URI, { useNewUrlParser: true, useUnifiedTopology: true });
client.connect()
    .then(() => console.log("Connected to MongoDB Atlas"))
    .catch((error) => console.error("Error connecting to MongoDB:", error));
const database = client.db('Interactive_messages');
const collection = database.collection("Messages");

const app = express();
app.use(cors());
app.use(express.json());
const server = createServer(app);

app.post('/send_messages', async (req,res)=>{
    const {message,phoneNumber} = req.body;
    const store_data = { ...req.body, status: 'Pending',error:false };
    collection.insertOne(store_data);
    const data = {
        messaging_product: "whatsapp",
        to: `+${phoneNumber}`,
        type: "interactive",
        interactive: {
          type: "button",
          body: {
            text: message
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: {
                  id: "accept",
                  title: "Accept"
                }
              },
              {
                type: "reply",
                reply: {
                  id: "reject",
                  title: "Reject"
                }
              }
            ]
          }
        }
      };
      try {
        const response = await axios.post(
          `https://graph.facebook.com/v14.0/${process.env.PHONE_NUMBER_ID}/messages`,
          data,
          {
            headers: {
              Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
        console.log("Message sent successfully", response.data);
        res.send(store_data);
      } catch (error) {
        console.error("Error sending message", error.response.data);
      }    
});

app.get('/fetch_data', async (req,res)=>{
    const data = await collection.find({}).toArray();
    res.json(data);
}); 

app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = req.query;
    console.log(process.env.VERIFY_TOKEN);
    console.log(verifyToken);
    if (verifyToken === process.env.VERIFY_TOKEN) {
      console.log("Webhook verified successfully");
      res.status(200).send(challenge);
    } else {
      console.log("not match");
      res.status(403).send("Verification token mismatch");
    }
  });

app.post('/webhook', (req, res) => {
    const { entry } = req.body;
    entry.forEach((entryItem) => {
      entryItem.changes.forEach((change) => {
        const value = change.value;
        if (value.messages) {
          const messageStatus = value.messages[0];
          const from = messageStatus.from;
          const buttonResponse = messageStatus.interactive.button_reply.id;
  
          if (buttonResponse === 'accept') {
              console.log(from);
            collection.updateOne(
              { phoneNumber: from, message: messageStatus.text },
              { $set: { status: 'Accepted' } }
            );
          } else if (buttonResponse === 'reject') {
              console.log(from);
            collection.updateOne(
              { phoneNumber: from, message: messageStatus.text },
              { $set: { status: 'Rejected' } }
            );
          }
        }
      });
    });
    res.send("got it");
  });
  

server.listen(process.env.PORT,()=>{
    console.log(`server started at ${process.env.PORT}`);
});

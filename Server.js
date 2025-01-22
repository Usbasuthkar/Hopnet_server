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
          `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
          data,
          {
            headers: {
              Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
        console.log("Message sent successfully", response.data.messages[0].id);
        const store_data = { ...req.body, status: 'Pending',u_id:response.data.messages[0].id,Reason_for_rejection:''};
        collection.insertOne(store_data);
        res.send(store_data);
      } catch (error) {
        console.error("Error sending message", error.response.data);
          res.status(403).send(error.response.data);
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
let button_response = false;  
app.post('/webhook', async (req, res) => {
  const { entry } = req.body;

  entry.forEach((entryItem) => {
    entryItem.changes.forEach(async (change) => {
      const value = change.value;

      if (value.messages) {
        const messageStatus = value.messages[0];
        const from = messageStatus.from;

        const sendMessage = async (textToSend) => {
          const data = {
            messaging_product: "whatsapp",
            to: `+${from}`,
            type: "text",
            text: { body: textToSend },
          };

          try {
            const response = await axios.post(
              `https://graph.facebook.com/v21.0/${process.env.PHONE_NUMBER_ID}/messages`,
              data,
              {
                headers: {
                  Authorization: `Bearer ${process.env.ACCESS_TOKEN}`,
                  "Content-Type": "application/json",
                },
              }
            );
            console.log("Message sent successfully", response.data.messages[0].id);
          } catch (error) {
            console.error("Error sending message", error.response.data);
          }
        };

        if (messageStatus.interactive && messageStatus.interactive.button_reply) {
          const buttonResponse = messageStatus.interactive.button_reply.id;
          const contextId = messageStatus.context?.id; // Safely access 'id'

          if (buttonResponse === 'accept' && contextId) {
            await collection.updateOne(
              { phoneNumber: from, u_id: contextId },
              { $set: { status: 'Accepted' } }
            );
            sendMessage("Thank you! Your response has been recorded.");
          } else if (buttonResponse === 'reject' && contextId) {
            await collection.updateOne(
              { phoneNumber: from, u_id: contextId },
              { $set: { status: 'Rejected', Reason_for_rejection: "Awaiting reason" } }
            );
            sendMessage("Can you please state the reason for rejection?");
          } else {
            console.error("Context ID is missing in the message");
            sendMessage("We could not process your response. Please try again.");
          }
        } else if (messageStatus.text) {
          const rejectionReason = messageStatus.text.body;
          const contextId = messageStatus.context?.id;

          if (contextId) {
            await collection.updateOne(
              { phoneNumber: from, u_id: contextId, status: 'Rejected' },
              { $set: { Reason_for_rejection: rejectionReason } }
            );
            sendMessage("Thank you for providing the reason!");
          } else {
            console.error("Context ID is missing for text message");
            sendMessage("We could not process your message. Please try again.");
          }
        } else {
          sendMessage("We will try to connect with you soon.");
        }
      }
    });
  });

  res.sendStatus(200);
});

server.listen(process.env.PORT,()=>{
    console.log(`server started at ${process.env.PORT}`);
});

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

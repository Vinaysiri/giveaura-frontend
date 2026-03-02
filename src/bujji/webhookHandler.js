// src/bujji/webhookHandler.js
const crypto = require('crypto');

function verifySignature(secret, body, signature) {
  const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}

module.exports = async function webhookHandler(req, res) {
  const raw = JSON.stringify(req.body); // or use raw body
  const sig = req.headers['x-bujji-signature'] || '';
  if (!verifySignature(process.env.BUJJI_WEBHOOK_SECRET, raw, sig)) {
    return res.status(401).send('invalid signature');
  }

  const event = req.body;
  // enqueue event for worker / call event handler
  // e.g. queue.add('bujjiEvent', event)
  res.status(200).send({ received: true });
};

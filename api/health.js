module.exports = function handler(_req, res) {
  res.status(200).json({ success: true, message: 'API functions are deployed (root api).' });
};

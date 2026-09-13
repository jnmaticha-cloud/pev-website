const app = require('./server/index.js');
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Prime Elite Ventures server running on port ${PORT}`);
  });
}

module.exports = app;

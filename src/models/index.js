const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const db = {};

// Conexiones (src/config/database.js): { nc, ventas }
const connections = require('../config/database');

// Load all models automatically. Cada modelo recibe las conexiones y elige la suya.
fs
  .readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) &&
           (file !== basename) &&
           (file.slice(-3) === '.js' &&
           !file.includes('.test.js'));
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(connections, Sequelize.DataTypes);
    db[model.name] = model;
  });

// Setup relationships between models
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Export sequelize instances and models
db.sequelizeNc = connections.nc;
db.sequelizeVentas = connections.ventas;
db.Sequelize = Sequelize;

module.exports = db;

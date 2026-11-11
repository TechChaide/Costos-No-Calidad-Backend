const express = require('express');
const router = express.Router();
const CoqController = require('../controllers/coq.controller');

// Endpoints
router.get('/costos-nc', CoqController.getCostosNc);
router.get('/ventas', CoqController.getVentas);
router.get('/actualizar', CoqController.getEstado);
router.post('/actualizar', CoqController.actualizar);
router.get('/health', CoqController.health);

module.exports = router;

const express = require('express');
const router = express.Router();
const InsuranceModel = require('../models/insuranceModel');

// GET /api/insurances — all categories with entries
router.get('/', (req, res) => {
  try {
    const categories = InsuranceModel.getAll();
    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/insurances/:id — single category
router.get('/:id', (req, res) => {
  try {
    const category = InsuranceModel.getById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/insurances — add a new category
// Body: { name, icon?, color?, description? }
router.post('/', (req, res) => {
  try {
    const { name, icon, color, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'name is required' });

    const category = InsuranceModel.addCategory({ name, icon, color, description });
    res.status(201).json({ success: true, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/insurances/:id/entries — add or update a year entry
// Body: { year, premium, provider }
router.post('/:id/entries', (req, res) => {
  try {
    const { year, premium, provider } = req.body;

    if (!year || premium == null || !provider) {
      return res.status(400).json({ success: false, message: 'year, premium, and provider are required' });
    }

    const updated = InsuranceModel.upsertEntry(req.params.id, {
      year: Number(year),
      premium: Number(premium),
      provider,
    });

    if (!updated) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/insurances/:id/entries/:year — remove a year entry
router.delete('/:id/entries/:year', (req, res) => {
  try {
    const updated = InsuranceModel.deleteEntry(req.params.id, Number(req.params.year));
    if (!updated) return res.status(404).json({ success: false, message: 'Category not found' });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

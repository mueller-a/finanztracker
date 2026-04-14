/**
 * Insurance Data Model
 *
 * Mirrors the structure of data.json and is designed to map 1:1
 * onto the following PostgreSQL schema when migrating from the JSON mock:
 *
 * TABLE categories
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
 *   name        VARCHAR(100) NOT NULL UNIQUE
 *   icon        VARCHAR(50)
 *   color       CHAR(7)          -- hex color e.g. #6366f1
 *   description TEXT
 *   created_at  TIMESTAMPTZ DEFAULT NOW()
 *
 * TABLE insurance_entries
 *   id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
 *   category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE
 *   year        SMALLINT NOT NULL
 *   premium     NUMERIC(10,2) NOT NULL  -- annual premium in EUR
 *   provider    VARCHAR(100) NOT NULL
 *   created_at  TIMESTAMPTZ DEFAULT NOW()
 *   UNIQUE (category_id, year)
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_PATH = path.join(__dirname, '..', 'data.json');

function readData() {
  const raw = fs.readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

const InsuranceModel = {
  /** Return all categories with their entries */
  getAll() {
    return readData().categories;
  },

  /** Return a single category by id */
  getById(id) {
    const { categories } = readData();
    return categories.find((c) => c.id === id) || null;
  },

  /**
   * Add or update an entry (year + premium + provider) for a category.
   * If an entry for that year already exists it is overwritten.
   */
  upsertEntry(categoryId, { year, premium, provider }) {
    const data = readData();
    const category = data.categories.find((c) => c.id === categoryId);
    if (!category) return null;

    const existing = category.entries.find((e) => e.year === year);
    if (existing) {
      existing.premium = premium;
      existing.provider = provider;
    } else {
      category.entries.push({
        id: `e_${uuidv4().slice(0, 8)}`,
        year,
        premium,
        provider,
      });
    }

    category.entries.sort((a, b) => a.year - b.year);
    writeData(data);
    return category;
  },

  /** Delete a specific year entry from a category */
  deleteEntry(categoryId, year) {
    const data = readData();
    const category = data.categories.find((c) => c.id === categoryId);
    if (!category) return null;

    category.entries = category.entries.filter((e) => e.year !== year);
    writeData(data);
    return category;
  },

  /** Add a new category */
  addCategory({ name, icon = 'tag', color = '#6366f1', description = '' }) {
    const data = readData();
    const newCategory = {
      id: `cat_${uuidv4().slice(0, 8)}`,
      name,
      icon,
      color,
      description,
      entries: [],
    };
    data.categories.push(newCategory);
    writeData(data);
    return newCategory;
  },
};

module.exports = InsuranceModel;

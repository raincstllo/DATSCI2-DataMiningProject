const mongoose = require('mongoose');

// One document per CSV row (one service line). A visit with several services
// shares the same visit_id across documents.
const visitSchema = new mongoose.Schema(
  {
    visit_id: { type: String, required: true, trim: true, match: /^V\d+$/ },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    date_visited: { type: Date, required: true },
    nature_of_visit: { type: String, required: true, trim: true, maxlength: 100 },
    // Each element is a tooth label (1-32 permanent, A-T primary). Empty when N/A.
    teeth_operated: { type: [String], default: [] },
    fee: { type: Number, required: true, min: 0 },
    source_row: { type: Number, required: true, min: 1 },
  },
  { strict: 'throw', collection: 'visits', timestamps: { createdAt: 'imported_at', updatedAt: false } },
);

visitSchema.index({ visit_id: 1 });
visitSchema.index({ date_visited: 1 });

module.exports = mongoose.model('Visit', visitSchema);

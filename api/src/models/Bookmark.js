/**
 * A private reading list (Phase 2).
 *
 * Same shape as Vote and the same unique-index reasoning, plus a privacy
 * requirement: no API response ever exposes who bookmarked what. Stored on the
 * experience document it would have shipped every bookmarker's id to every
 * reader — anyone could see who was preparing for which company. Spec BOOK-02.
 */
import mongoose from 'mongoose';

const bookmarkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    experienceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Experience', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'bookmarks' },
);

bookmarkSchema.index({ userId: 1, experienceId: 1 }, { unique: true, name: 'bookmark_user_experience_unique' });
bookmarkSchema.index({ userId: 1, createdAt: -1 }, { name: 'bookmark_user_recent' });

export const Bookmark = mongoose.model('Bookmark', bookmarkSchema);

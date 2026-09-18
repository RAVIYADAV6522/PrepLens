/**
 * A verified NST student. Created by Google OAuth (Block 2), never by signup.
 */
import mongoose from 'mongoose';
import { USER_ROLES, BRANCHES } from './enums.js';

const userSchema = new mongoose.Schema(
  {
    // The stable identity key. A student's email can change; this cannot, so
    // every login upsert keys on it rather than on the address.
    googleId: { type: String, required: true, immutable: true },

    /**
     * `select: false` is a privacy control, not a performance one.
     *
     * The prototype printed the author's full college address on every public
     * card — harvestable by any scraper, and it makes anonymity impossible.
     * With `select: false` the field is absent from every query result unless
     * a caller explicitly asks for it, so leaking it has to be deliberate
     * rather than accidental. Spec NFR-V1.
     */
    email: { type: String, required: true, lowercase: true, trim: true, select: false },

    name: { type: String, required: true, trim: true, maxlength: 120 },
    avatar: { type: String, trim: true },

    // Collected once after first login (AUTH-06), so nullable until then.
    graduationBatch: { type: Number, min: 2000, max: 2100 },
    branch: { type: String, enum: BRANCHES },

    role: { type: String, enum: USER_ROLES, default: 'student', required: true },
  },
  { timestamps: true, collection: 'users' },
);

/**
 * INDEXES ARE DECLARED HERE AND NOWHERE ELSE.
 *
 * `unique: true` on a field is not a validator — it IS an index declaration,
 * and Mongoose creates it as `email_1`. Declaring the same keys again with a
 * name then fails with IndexOptionsConflict: "Index already exists with a
 * different name". Two declarations of one index is the bug; the fix is to
 * keep the explicit, named ones, because a name you chose is greppable and
 * shows up readably in .explain() output.
 */
userSchema.index({ googleId: 1 }, { unique: true, name: 'user_googleId_unique' });
userSchema.index({ email: 1 }, { unique: true, name: 'user_email_unique' });

/** The only shape of a user that may reach a client. Never includes email. */
userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toString(),
    name: this.name,
    avatar: this.avatar,
    graduationBatch: this.graduationBatch,
    branch: this.branch,
    role: this.role,
  };
};

export const User = mongoose.model('User', userSchema);

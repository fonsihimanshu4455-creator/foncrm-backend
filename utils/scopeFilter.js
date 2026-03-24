const { Types } = require('mongoose')

/**
 * Returns a MongoDB filter based on the user's role.
 * - superadmin : no filter (sees everything)
 * - admin/manager : scoped to their company
 * - agent/viewer  : scoped to records they own or are assigned to
 *
 * @param {object} user   - req.user (decoded JWT payload)
 * @param {object} extra  - additional filters to AND in
 */
const getScopeFilter = (user, extra = {}) => {
  if (user.role === 'superadmin') return { ...extra }

  if (user.role === 'admin' || user.role === 'manager') {
    return { ...extra, company: user.company }
  }

  // agent / viewer
  const uid = Types.ObjectId.isValid(user.id) ? new Types.ObjectId(user.id) : user.id
  return {
    ...extra,
    $or: [{ assignedTo: uid }, { createdBy: uid }]
  }
}

module.exports = { getScopeFilter }

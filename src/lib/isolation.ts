/**
 * Data isolation helper — Spec §5 and §17.
 *
 * All user-facing queries must filter by is_test_user to enforce separation
 * between the test world and the real world. This helper returns the filter
 * clause to be spread into Prisma where conditions.
 */

export interface IsolationUser {
  isTestUser: boolean;
}

/**
 * Returns a Prisma-compatible filter object that restricts queries
 * to only users matching the current user's test/real status.
 *
 * Usage:  where: { ...isolationFilter(currentUser), ...otherFilters }
 */
export function isolationFilter(currentUser: IsolationUser) {
  return { isTestUser: currentUser.isTestUser };
}

/**
 * Filter for entities that belong to users in the same world.
 * Use on tables with a userId FK that points to the users table.
 *
 * Usage:  where: { user: userIsolationFilter(currentUser) }
 */
export function userIsolationFilter(currentUser: IsolationUser) {
  return { isTestUser: currentUser.isTestUser };
}

/**
 * Filter for sessions — a session belongs to the test world if its
 * creator is a test user.
 */
export function sessionIsolationFilter(currentUser: IsolationUser) {
  return {
    createdBy: {
      isTestUser: currentUser.isTestUser,
    },
  };
}

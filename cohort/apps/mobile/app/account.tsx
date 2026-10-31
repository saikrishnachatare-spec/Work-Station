/** The account screen moved to the Profile bottom tab. Keep this redirect so
 * existing /account links (e.g. "Edit profile" on a member's own page) land there. */
import { Redirect } from 'expo-router';

export default function AccountRedirect() {
  return <Redirect href="/profile" />;
}

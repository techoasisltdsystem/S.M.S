// Header helpers on the public website. Sign-in goes straight to each audience's own page:
// students -> /student/login, approved staff -> /staff/login (applicants -> /staff/apply).
function logoutUser(e) {
    if (e) e.stopPropagation();
    TOS.auth.logout();
    go('home');
}

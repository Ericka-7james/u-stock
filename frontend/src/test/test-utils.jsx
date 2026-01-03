// // src/test/test-utils.jsx
// import React from "react";
// import { render } from "@testing-library/react";
// import { MemoryRouter } from "react-router-dom";
// import { AuthProvider } from "../context/AuthContext";

// /**
//  * Render a component wrapped in:
//  *  - AuthProvider (so useAuth() works)
//  *  - MemoryRouter (for routing + <Link>)
//  */
// export function renderWithRouterAndAuth(ui, { route = "/" } = {}) {
//   const Wrapper = ({ children }) => (
//     <AuthProvider>
//       <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
//     </AuthProvider>
//   );

//   return render(ui, { wrapper: Wrapper });
// }

// export default renderWithRouterAndAuth;

import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  ...nextConfig,
  {
    // localStorage and the URL are browser-only sources that hydrate client state.
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default config;

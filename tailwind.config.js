/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./i18n/template.html", "./js/main.js"],
  theme: {
    extend: {
      colors: {
        ink: "#08070a",
        ink2: "#0f0a0b",
        ink3: "#171012",
        bone: "#f3ede1",
        muted: "#b7ab9c",
        blood: "#c31c22",
      },
      fontFamily: {
        display: ["Cinzel", "serif"],
        body: ["EB Garamond", "serif"],
      },
    },
  },
  plugins: [],
};

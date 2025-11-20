import app from "./app";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`API on http://0.0.0.0:${PORT}`);
});

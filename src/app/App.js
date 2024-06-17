import logo from './logo.svg';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <h2>Welcome to my portfolio!</h2>
        <p>
          Muhammad Basit Zaheer
        </p>
        <a
          className="App-link"
          href="https://www.linkedin.com/in/muhammad-basit-zaheer/"
          target="_blank"
          rel="noopener noreferrer"
        >
          LinkedIn
        </a>
        <a
          className="App-link"
          href="https://github.com/basit3000"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a
          className="App-link"
          href="https://leetcode.com/u/basit3000/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Leetcode
        </a>
      </header>
    </div>
  );
}

export default App;

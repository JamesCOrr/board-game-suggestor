import './App.css';
import poweredByBgg from './assets/powered-by-bgg-reversed-rgb.svg';

function App() {

  return (
      <div>
        <h1>Board Game Suggestor</h1>
        <div className="card">
          <button onClick={() => console.log('Button pushed')}>
            Request User Data
          </button>
        </div>
        <img src={poweredByBgg} alt="Powered by BoardGameGeek" />

      </div>
  )
}

export default App

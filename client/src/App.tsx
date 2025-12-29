import './App.css';

const baseUrl = 'https://boardgamegeek.com/xmlapi2/';
const user = '@James_Orr';
const parameters =`?name=${user}`;
const url = baseUrl + parameters;

function App() {

  return (
      <div>
        <h1>Board Game Suggestor</h1>
        <div className="card">
          <button onClick={() => console.log('Button pushed')}>
            Request User Data
          </button>
        </div>
      </div>
  )
}

export default App

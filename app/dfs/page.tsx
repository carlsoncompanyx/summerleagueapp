import DfsClient from '../../components/DfsClient';

export default function DfsPage() {
  return <main><h1>DFS Contest Lobby</h1><section className='card' style={{marginBottom:12}}><p className='muted'>If loading fails, use the in-page refresh and try again. Contest data is loaded live from the server.</p></section><DfsClient /></main>;
}

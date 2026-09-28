/** Decorative affordance only: never an announcement of an accepted action. */
export function ActionButtonAura({kind}:{kind:'pung'|'kong'|'hu'|'pass'}){
 return <span className={`crystal-aura crystal-aura-${kind}`} aria-hidden="true">
  {kind==='hu'?<span className="crystal-fire">
   <img className="crystal-fire-ring fire-flow-a" src={`${import.meta.env.BASE_URL}ui/actions-crystal-v3/fire-ring.png`} alt="" draggable={false}/>
   <span className="fire-breath"><img className="crystal-fire-ring fire-flow-b" src={`${import.meta.env.BASE_URL}ui/actions-crystal-v3/fire-ring.png`} alt="" draggable={false}/></span>
  </span>:kind!=='pass'?<svg viewBox="0 0 100 100" className="crystal-stream">
   <circle className="blue-orbit blue-orbit-a" cx="50" cy="50" r="45"/>
   <circle className="blue-orbit blue-orbit-b" cx="50" cy="50" r="48"/>
   <path className="blue-spark" d="M15 18 L18 12 L20 18 L26 20 L20 22 L18 28 L16 22 L10 20Z"/>
  </svg>:null}
 </span>;
}

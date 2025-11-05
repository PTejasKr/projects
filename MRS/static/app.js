const api = {
  genres: '/genres',
  recommend: '/recommend',
  scrape: '/scrape_imdb',
  news: '/news_movies',
  remove_similar: '/remove_similar',
  fav_add: '/favorites/add',
  fav_list: '/favorites'
}

let diceVal = 1

async function init(){
  const gsel = document.getElementById('genre')
  const res = await fetch(api.genres)
  const genres = await res.json()
  genres.forEach(g=>{
    const o = document.createElement('option');o.value=g;o.textContent=g;gsel.appendChild(o)
  })
  loadFavorites()
}

document.getElementById('rollBtn').addEventListener('click', ()=>{
  diceVal = Math.floor(Math.random()*6)+1
  document.getElementById('diceVal').textContent = diceVal
})

document.getElementById('goBtn').addEventListener('click', async ()=>{
  const genre = document.getElementById('genre').value
  const payload = {genre, dice: diceVal}
  const r = await fetch(api.recommend, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)})
  const data = await r.json()
  showRecommended(data.recommended)
  populateCards(data.movies.slice(0,20), genre)
})

function showRecommended(m){
  const rec = document.getElementById('recCard')
  rec.innerHTML = ''
  const img = document.createElement('img')
  img.src = m.poster || ''
  img.style.width = '160px'
  img.style.borderRadius = '6px'
  const title = document.createElement('div')
  title.innerHTML = `<h4>${m.title || ''} (${m.year||''})</h4><a href='${m.streaming_link}' target='_blank'>Where to watch</a>`
  rec.appendChild(img)
  rec.appendChild(title)
}

function populateCards(list, genre){
  const container = document.getElementById('cards')
  container.innerHTML = ''
  list.forEach(m=>{
    const c = document.createElement('div')
    c.className = 'card'
    c.dataset.title = m.title || ''
    c.innerHTML = `<img src='${m.poster || ''}' alt='poster'/><h4>${m.title||''}</h4><a href='${m.streaming_link}' target='_blank'>Watch</a>`
    attachSwipe(c,m,genre)
    container.appendChild(c)
  })
}

function attachSwipe(card, movie, genre){
  let startX = 0, curX = 0, dragging=false
  card.addEventListener('pointerdown', e=>{dragging=true;startX=e.clientX;card.setPointerCapture(e.pointerId)})
  card.addEventListener('pointermove', e=>{if(!dragging) return; curX = e.clientX - startX; card.style.transform = `translateX(${curX}px) rotate(${curX/20}deg)`})
  card.addEventListener('pointerup', e=>{dragging=false; card.releasePointerCapture(e.pointerId); handleRelease(card, movie, curX, genre)})
  card.addEventListener('pointercancel', e=>{dragging=false; card.style.transform='';})
}

async function handleRelease(card,movie,dx,genre){
  const container = document.getElementById('cards')
  if(dx > 120){
    // favorite — persist to server
    await fetch(api.fav_add, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({title: movie.title, link: movie.link, poster: movie.poster, streaming_link: movie.streaming_link})})
    addFavoriteLocal(movie)
    card.remove()
  } else if(dx < -120){
    // remove and request backend to compute similar movies and remove them from DOM
    card.remove()
    try{
      const res = await fetch(api.remove_similar, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({genre, title: movie.title, threshold:0.35})})
      const data = await res.json()
      const toRemove = data.removed || []
      toRemove.forEach(r=>{
        // find cards with matching title and remove
        const nodes = Array.from(document.querySelectorAll('.card'))
        nodes.forEach(n=>{ if(n.dataset.title && n.dataset.title.toLowerCase() === (r.title || '').toLowerCase()) n.remove() })
      })
    }catch(err){
      console.warn('remove_similar failed', err)
    }
  } else {
    card.style.transform=''
  }
}

function addFavoriteLocal(movie){
  const ul = document.getElementById('favs')
  const li = document.createElement('li')
  li.innerHTML = `<strong>${movie.title}</strong> <a href='${movie.streaming_link}' target='_blank'>watch</a>`
  ul.appendChild(li)
}

async function loadFavorites(){
  try{
    const res = await fetch(api.fav_list)
    const data = await res.json()
    const ul = document.getElementById('favs')
    ul.innerHTML = ''
    (data.favorites || []).forEach(f=>{
      const li = document.createElement('li')
      li.innerHTML = `<strong>${f.title}</strong> <a href='${f.streaming_link||f.link||"#"}' target='_blank'>watch</a>`
      ul.appendChild(li)
    })
  }catch(e){console.warn('failed to load favorites', e)}
}

init()

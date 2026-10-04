const material = (id,name,color,roughness=.65,metalness=0) => ({id,name,color,roughness,metalness});
const part = (id,name,primitive,params,position,mat,rotation=[0,0,0],scale=[1,1,1],points) => ({id,name,primitive,params,position,rotation,scale,material:mat,...(points?{points}:{})});
const chair = {
  title:'Studio chair',description:'A sculptural oak chair with a softly upholstered seat. Explore the controls, then upload your own reference.',limitations:['Handmade example model, not an AI reconstruction.'],
  materials:[material('oak','Natural oak','#a37650',.55),material('linen','Warm linen','#dcd1b6',.9),material('rubber','Foot caps','#6c665a',.8)],
  components:[
    part('seat','Linen seat','roundedBox',[1.35,.22,1.27,.1],[0,1.27,0],'linen'),
    part('base','Oak seat frame','roundedBox',[1.36,.14,1.28,.055],[0,1.13,0],'oak'),
    part('back','Curved linen back','roundedBox',[1.38,.72,.18,.085],[0,1.96,-.57],'linen',[-.13,0,0]),
    part('back-frame','Backrest edge','roundedBox',[1.44,.78,.12,.05],[0,1.94,-.65],'oak',[-.13,0,0]),
    ...[-1,1].flatMap((x,i)=>[-1,1].map((z,j)=>part(`leg${i}${j}`,'Tapered oak leg','cylinder',[.065,.045,1.1],[x*.54,.55,z*.49],'oak',[z*.11,0,-x*.1]))),
    ...[-1,1].map((x,i)=>part(`support${i}`,'Backrest support','cylinder',[.035,.035,1.05],[x*.59,1.51,-.63],'oak',[-.13,0,0])),
    ...[-1,1].map((x,i)=>part(`arm${i}`,'Soft oak armrest','roundedBox',[.105,.11,1.08,.04],[x*.7,1.63,-.06],'oak')),
    ...[-1,1].map((x,i)=>part(`arm-support${i}`,'Armrest upright','cylinder',[.032,.032,.47],[x*.7,1.36,.36],'oak')),
    part('brace','Cross brace','cylinder',[.028,.028,1.12],[0,.45,-.48],'oak',[0,0,Math.PI/2])
  ]
};
const lamp = {
  title:'Mushroom lamp',description:'A playful terracotta mushroom lamp with a satin ceramic finish and a warm ivory stem.',limitations:['Handmade example model, not an AI reconstruction.'],
  materials:[material('cap','Burnt terracotta','#b96442',.35),material('stem','Ivory ceramic','#e3d7bf',.3),material('rim','Soft underside','#f1dfb6',.6)],
  components:[
    part('stem','Curved ceramic stem','lathe',[],[0,0,0],'stem',[0,0,0],[1,1,1],[[.52,0,0],[.55,.07,0],[.51,.15,0],[.41,.45,0],[.29,.87,0],[.26,1.3,0]]),
    part('shade','Mushroom shade','lathe',[],[0,1.12,0],'cap',[0,0,0],[1,1,1],[[0,.75,0],[.21,.74,0],[.48,.66,0],[.76,.48,0],[.94,.2,0],[1,.03,0],[.98,0,0],[.94,.04,0],[.87,.21,0],[.65,.48,0],[.31,.62,0],[0,.64,0]]),
    part('underside','Warm diffuser','sphere',[.94],[0,1.16,0],'rim',[0,0,0],[1,.12,1])
  ]
};
const plant = {
  title:'Little green friend',description:'A young rubber plant in a speckle-free clay pot, with gently curved foliage and a quiet earthy palette.',limitations:['Handmade example model, not an AI reconstruction.'],
  materials:[material('pot','Clay pot','#a88467',.85),material('leaf','Leaf green','#52694c',.48),material('stem','Young stems','#78815a',.6),material('soil','Potting soil','#51473b',1)],
  components:[
    part('pot','Tapered clay pot','lathe',[],[0,0,0],'pot',[0,0,0],[1,1,1],[[.43,0,0],[.48,.02,0],[.58,.76,0],[.59,.81,0],[.54,.81,0],[.52,.74,0],[.4,.08,0],[.43,0,0]]),
    part('soil','Soil surface','cylinder',[.53,.53,.03],[0,.73,0],'soil'),
    part('main-stem','Main stem','tube',[.023],[0,0,0],'stem',[0,0,0],[1,1,1],[[0,.7,0],[.05,1.2,0],[-.04,1.8,0],[.06,2.35,0]]),
    ...Array.from({length:9},(_,i)=> {
      const a=i*2.4,y=.93+i*.155, r=.22+i*.01;
      return part(`leaf-${i}`,'Rubber leaf','sphere',[1],[Math.cos(a)*r,y,Math.sin(a)*r],'leaf',[.25,a,.3],[.22,.045,.4]);
    }),
    ...Array.from({length:9},(_,i)=>{
      const a=i*2.4,y=.93+i*.155,r=.22+i*.01;
      return part(`branch-${i}`,'Leaf branch','tube',[.012],[0,0,0],'stem',[0,0,0],[1,1,1],[[0,y-.13,0],[Math.cos(a)*r*.5,y-.04,Math.sin(a)*r*.5],[Math.cos(a)*r,y,Math.sin(a)*r]]);
    })
  ]
};
export const examples = {chair,lamp,plant};

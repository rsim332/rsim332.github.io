window.$$ = window.$$ || function(selector, context) {
	context = context || document;
	var elements = context.querySelectorAll(selector);
	return Array.prototype.slice.call(elements);
}
window.$ = window.$ || function(selector, context) {
	context = context || document;
	return context.querySelector(selector);
}

var observers = {}

function subscribe(event,fn) {
	if(!observers[event]) observers[event] = [];
	observers[event].push(fn);
}
function notify(event,data) {
	if(!observers[event]) return;
	observers[event].forEach(function(fn){
		fn(data)
	});
}

document.addEventListener('click',(e)=>notify('click',e))
document.addEventListener('keydown',(e)=>notify('keydown',e));
document.addEventListener('keyup',(e)=>notify('keyup',e));


var attachments = [];
document.querySelectorAll('input[type=file]').forEach(input=>{
	input.setAttribute('data-attachmentIndex',attachments.length);
	attachments.push({});
	input.addEventListener('change',(event)=>{
		var attachmentIndex = parseInt(event.target.getAttribute('data-attachmentIndex'));
		var files = event.target.files || event.dataTransfer.files;

		var file = files[0];
		if(!file) return;

		var reader = new FileReader();
		reader.onload = e => attachments[attachmentIndex] = { name:file.name, content:e.target.result };
		reader.readAsDataURL(file);
	})
})


function collectInputs(form){
	return new Promise((resolve,reject)=>{
		let data = [];
		form.querySelectorAll('.form-group').forEach(group=>{
			var field = group.querySelector('label').innerText;
			var checkboxes = group.querySelectorAll('input[type="checkbox"],input[type="radio"]');
			if(checkboxes.length>1){
				var values = [];
				checkboxes.forEach(function(cb){
					if(cb.checked) values.push(cb.getAttribute('value'));
				});
				if(values.length==0 && checkboxes[0].hasAttribute('required')){
					return reject(`${field} é obrigatório`);
				}
				data.push({field:field, value:values.join(', ')});
			} else {
				var input = group.querySelector('input,select,textarea');
				if(!input) return;
				if(input.hasAttribute('required') && input.value==''){
					return reject(`${field} é obrigatório`)
				}
				var value = input.value;
				if(input.type==='file') {
					var attachmentIndex = parseInt(input.getAttribute('data-attachmentIndex'));
					value = attachments[attachmentIndex].name;
				}
				data.push({field:field, value:value})
			}
		});
		resolve(data);
	});
}

var lastSend = '';

subscribe('click',e=>{
	var button = e.target.closest('button');
	if(!button) return;
	if(button.disabled) return;
	if(!button.matches('.btn-submit-email')) return;
	e.preventDefault();
	if(button.getAttribute('data-overriden')) return;

	const pipeline_id = button.getAttribute('data-pipeline-id');

	var form = e.target.closest('form');
	if(!form) return;
	collectInputs(form).then(data=>{
		var text = data.map(item=>{
			return `${item.field}: ${item.value}`;
		}).join("\n");

		var finalText = text;

		var prepend = button.getAttribute('data-prepend');
		if(prepend) {
			finalText = prepend +"\n"+ finalText;
			data.push({field:'data-prepend',value:prepend});
		}

		var append = button.getAttribute('data-append');
		if(append) {
			finalText = finalText +"\n"+ append;
			data.push({field:'data-append',value:append});
		}

		const matchRefs = text.match(/\{\s?ref:\s?[^}]+\s?\}/g);
		if(matchRefs){
			matchRefs.forEach(ref=>{
				const matchSpecific = ref.match(/\{\s?ref:\s?([^}]+)\s?\}/);
				if(!matchSpecific) return;
				const refName = matchSpecific[1].trim();
				//search on open modals
				let el = document.querySelector(`.modal-active [data-ref="${refName}"]`);
				//search on all document
				if(!el) el = document.querySelector(`[data-ref="${refName}"]`);

				if(!el) return;

				text = text.replace(ref,el.innerText.trim());
			});
		}

		var confirmationMsg = button.getAttribute('data-confirmation') || 'Formulário enviado com sucesso.';

		if(text==lastSend){
			alert(confirmationMsg);
			return;
		}

		var postdata = {
			button:'email',
			text:finalText,
			to:button.getAttribute('data-to'),
			subject:button.getAttribute('data-subject'),
			hash:button.getAttribute('data-hash'),
			attachments:attachments,
			data:data,
		}

		if(pipeline_id){
			postdata.pipelines = [pipeline_id];
		}

		button.setAttribute('disabled',true);

		var clientEmailEnabled = button.getAttribute('data-client-enabled');
		if(clientEmailEnabled){

			var clientText = text;
			var clientPrepend = button.getAttribute('data-client-prepend');
			if(clientPrepend) clientText = clientPrepend +"\n"+ clientText;

			var clientEmail = {
				subject:button.getAttribute('data-client-subject'),
				text:clientText,
			}

			postdata.clientEmail = clientEmail;
		}

		fetch('/_post',{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(postdata),
		})
		.then(()=>{
			notify('formSubmitted');
			button.removeAttribute('disabled');
			lastSend = text;
			alert(confirmationMsg);
			if(button.hasAttribute('data-reset')) form.reset();

			if(button.hasAttribute('data-redirect-enabled')){
				var redirectUrl = button.getAttribute('data-redirect-url');
			}
			if(redirectUrl) {
				window.location.href = redirectUrl;
			}

		}).catch(res=>{
			alert('Falha ao enviar formulário. Tente novamente mais tarde');
		});

	}).catch(error=>{
		alert(error);
	})
});

subscribe('click',e=>{
	var button = e.target.closest('button');
	if(!button) return;
	if(button.disabled) return;
	if(!button.matches('.btn-submit-whats')) return;
	e.preventDefault();
	if(button.getAttribute('data-overriden')) return;

	const pipeline_id = button.getAttribute('data-pipeline-id');

	var form = button.closest('form');
	if(!form) return;

	collectInputs(form).then(data=>{

		var text = data.map(item=>{
			const value = item.value ?? '';
			return item.field+': '+(value.match(/\n/)?value:`*${value}*`);
		}).join("\n");

		var prepend = button.getAttribute('data-prepend');
		if(prepend) {
			text = prepend +"\n"+ text;
			data.push({field:'data-prepend',value:prepend});
		}

		var append = button.getAttribute('data-append');
		if(append) {
			text = text +"\n"+ append;
			data.push({field:'data-append',value:append});
		}

		const matchRefs = text.match(/\{\s?ref:\s?[^}]+\s?\}/g);
		if(matchRefs){
			matchRefs.forEach(ref=>{
				const matchSpecific = ref.match(/\{\s?ref:\s?([^}]+)\s?\}/);
				if(!matchSpecific) return;
				const refName = matchSpecific[1].trim();
				//search on open modals
				let el = document.querySelector(`.modal-active [data-ref="${refName}"]`);
				//search on all document
				if(!el) el = document.querySelector(`[data-ref="${refName}"]`);

				if(!el) return;

				text = text.replace(ref,el.innerText.trim());
			});
		}

		var number = button.getAttribute('data-number');

		let newWin = null;
		const hasAttachments = attachments.length && attachments.some(a=>a.name);
		if(!hasAttachments){
			var href = 'https://api.whatsapp.com/send?phone=' + number + '&text=' + encodeURIComponent(text);
			window.open(href, '_blank');
		} else {
			newWin = window.open('about:blank', '_blank');
			newWin.document.write('<html><head><title>Enviando...</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><h1>Enviando...</h1><p>Por favor, aguarde...</p></body></html>');
		}

		var postdata ={
			button:'whatsapp',
			text:text,
			number:number,
			hash:'',
			data:data,
			attachments:attachments,
		}

		if(pipeline_id){
			postdata.pipelines = [pipeline_id];
		}

		fetch('/_post',{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(postdata),
		}).then(async response => {
			notify('formSubmitted');
			const responseText = await response.text();
			try{
				const jsonOutput = JSON.parse(responseText);
				return jsonOutput;
			}catch(e){
				return responseText;
			}
		}).then(postResponse=>{
			if(hasAttachments){
				if(postResponse.attachments){
					postResponse.attachments.forEach(attachment=>{
						text = text.replace(attachment.name,attachment.url);
					})
				}
				newWin.location.href = 'https://api.whatsapp.com/send?phone=' + number + '&text=' + encodeURIComponent(text);
			}
		});

		if(button.hasAttribute('data-reset')) form.reset();

		if(button.hasAttribute('data-redirect-enabled')){
			var redirectUrl = button.getAttribute('data-redirect-url');
		}
		if(redirectUrl) {
			window.location.href = redirectUrl;
		}

	}).catch(error=>{
		alert(error);
	})

})


subscribe('click',e=>{
	var button = e.target.closest('button');
	if(!button) return;
	if(button.disabled) return;
	if(!button.matches('.btn-submit-tel')) return;
	e.preventDefault();
	if(button.getAttribute('data-overriden')) return;

	const pipeline_id = button.getAttribute('data-pipeline-id');

	var form = button.closest('form');
	if(!form) return;

	collectInputs(form).then(data=>{

		var text = data.map(item=>{
			const value = item.value ?? '';
			return item.field+': '+(value.match(/\n/)?value:`*${value}*`);
		}).join("\n");

		var prepend = button.getAttribute('data-prepend');
		if(prepend) {
			text = prepend +"\n"+ text;
			data.push({field:'data-prepend',value:prepend});
		}

		var append = button.getAttribute('data-append');
		if(append) {
			text = text +"\n"+ append;
			data.push({field:'data-append',value:append});
		}

		var number = button.getAttribute('data-number');

		var href = 'tel:'+number;
		window.open(href,'_blank');

		var postdata ={
			button:'tel',
			text:text,
			number:number,
			hash:'',
			data:data,
			attachments:attachments,
		}

		if(pipeline_id){
			postdata.pipelines = [pipeline_id];
		}

		fetch('/_post',{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(postdata),
		});

		notify('formSubmitted');

		if(button.hasAttribute('data-reset')) form.reset();

		if(button.hasAttribute('data-redirect-enabled')){
			var redirectUrl = button.getAttribute('data-redirect-url');
		}
		if(redirectUrl) {
			window.location.href = redirectUrl;
		}

	}).catch(error=>{
		alert(error);
	})

})


renderTemplateUpdate = function(template,field,value){

	if(template.trim().match(/^<(tr|td|tbody|thead)/)){
		var dom = document.createElement('table');
	} else {
		var dom = document.createElement('div');
	}

	dom.innerHTML = template;

	if(value===undefined) value='';

	dom.querySelectorAll(`[x-text="${field}"]`).forEach(elm=> { elm.innerHTML = value });
	dom.querySelectorAll(`[x-html="${field}"]`).forEach(elm=> { elm.innerHTML = value });

	var regexp = new RegExp(`x-bind:([a-z-]+)="${field}"`,'ig');
	var matches = template.match(regexp)
	if(matches) for(var i in matches){
		var regexp = new RegExp(`x-bind:([a-z-]+)="${field}"`,'i');
		var match = matches[i].match(regexp)
		var attribute = match.pop();
		if(dom.hasAttribute(`x-bind:${attribute}`) && dom.getAttribute(`x-bind:${attribute}`)==field) {
			if(value){
				dom.setAttribute(attribute,value);
			} else {
				dom.removeAttribute(attribute);
			}
		}
		dom.querySelectorAll(`[x-bind\\:${attribute}="${field}"]`).forEach(elm=>{
			if(value){
				elm.setAttribute(attribute,value)
			} else {
				elm.removeAttribute(attribute);
			}
		});
	}

	var regexp = new RegExp(`x-show="${field}"`,'ig');
	var matches = template.match(regexp)
	if(matches) for(var i in matches){
		var regexp = new RegExp(`x-show="${field}"`,'i');
		var match = matches[i].match(regexp)
		if(dom.hasAttribute(`x-show`) && dom.getAttribute(`x-show`)==field) {
			dom.style.display = (!value?'none':'');
		}
		dom.querySelectorAll(`[x-show="${field}"]`).forEach(elm=>{ elm.style.display = (!value?'none':''); });
	}

	var regexp = new RegExp(`x-style=".*?['"]?([^'":]+?)['"]?: ?${field}\\b`,'ig');

	var matches = template.match(regexp)
	if(matches) for(var i in matches){
		var regexp = new RegExp(`x-style=".*?['"]?([^'":]+?)['"]?: ?${field}\\b`,'i');
		var match = matches[i].match(regexp)
		var prop = match[1];

		if(dom.hasAttribute(`x-style`) && dom.getAttribute(`x-style`).includes(field)) {
			dom.style.setProperty(prop,value);
		}
		dom.querySelectorAll(`[x-style]`).forEach(elm=>{
			if(elm.getAttribute(`x-style`).includes(field)) {
				elm.style.setProperty(prop,value);
			}
		});
	}

// var regexp = new RegExp(`\bhref="[^"]*?{{ *${field} *}}[^"]*?"`,'ig');
// var matches = template.match(regexp)
// if(matches) for(var i in matches){
//
// }



	return dom.innerHTML;
}


renderTemplateLoopSet = function(template,field,data){
	//[{"id":1,"name":"primeira carta","created_at":"2020-07-06T03:09:44.000000Z","carta":"carta xyz","valor":"30.000"},{"id":2,"name":"segunda carta","created_at":"2020-07-06T03:10:06.000000Z","carta":"carta xyz2","valor":"45.000"}]
	var dom = document.createElement('div');
	dom.innerHTML = template;

	//get first element and find its siblings (in case some subcomponent has loop too)
	var firstElement = dom.querySelector(`[x-for$="in ${field}"]`);
	var parentNode = firstElement.parentNode;
	var elements = parentNode.querySelectorAll(`:scope > [x-for$="in ${field}"]`);

	//remove all, keep 1 only
	while(elements.length>1) {
		parentNode.removeChild(elements[1]);
		elements = parentNode.querySelectorAll(`:scope > [x-for$="in ${field}"]`);
	}

	//ensure this 1 element is not hidden
	firstElement.style.display = '';

	var childKey = firstElement.getAttribute('x-for').match(/^([a-z0-9-]+) in /).pop();
	var i,f, element;
	for(i=0;i<data.length;i++){
		if(i==0){
			element = firstElement;
		} else {
			var clone = firstElement.cloneNode(true);
			element = parentNode.appendChild(clone);
		}
		var template = element.outerHTML;
		for(f in data[i]){
			template = renderTemplateUpdate(template,`${childKey}.${f}`,data[i][f]);
		}
		element.outerHTML = template;
	}
	if(data.length==0){
		firstElement.style.display = 'none';
	}

	return dom.innerHTML;
}


mapData = function(sourceMap,data){

	var resultData = [];
	for(var index in data){
		var row = data[index];
		var newRow = data[index];

		for(var to in sourceMap){
			var from = sourceMap[to];
			newRow[to] = row[from];
		}
		resultData.push(newRow);
	}

	return resultData;

}

looseJsonParse = function(obj){
	return Function('"use strict";return (' + obj + ')')();
 }


$$('[data-source]').forEach(el=>{

	if(el.getAttribute('data-overriden')) return;

	var protected = el.closest('[data-block-protected]');
	if(protected) return false;

	const isPreview = !!el.closest('[data-td-preview]');

	var dataSource = el.getAttribute('data-source');
	var match = dataSource.match(/^(api|db):(.+)$/);
	if(!match) return;
	var sourceType = match[1];
	var sourceName = match[2];

	var dataSourceMap = looseJsonParse(el.getAttribute('data-source-map'));

	var firstElement = el.querySelector(`[x-for]`);
	var fieldName = firstElement.getAttribute('x-for').match(/in (.*)/).pop();

	const host = location?.host ? `//${location.host}` : '';
	if(sourceType=='db'){
		fetch(`${host}/api/db/${sourceName}/data`)
		.then(response => response.json())
		.then(data => {
			data = mapData(dataSourceMap,data);
			el.outerHTML = renderTemplateLoopSet(el.outerHTML,fieldName,data);
			notify('domLoaded');
		});
	}
	if(sourceType=='api'){
		var url = sourceName;
		if(!sourceName.match(/https:\/\/api\.themedeploy/)){
			const encodedUrl = encodeURIComponent(sourceName);
			url = `https://api.themedeploy.com/api/fetch?url=${encodedUrl}${isPreview?'&preview=1':''}`;
		}
		fetch(url)
		.then(response => response.json())
		.then(data => {
			data = mapData(dataSourceMap,data);
			el.outerHTML = renderTemplateLoopSet(el.outerHTML,fieldName,data);
			notify('domLoaded');
		});
	}

})



subscribe('domLoaded',function(){
	//initialize fslightbox
	$$('a[href$="png"], a[href$="jpg"], a[href$="jpeg"], a[href$="webp"]').forEach(el=>{
		if(el.hasAttribute('data-fslightbox')) return;
		el.setAttribute('data-fslightbox','');
		el.setAttribute('data-type','image');
	});

	//put header name to attr to prepare responsive version
	$$('table').forEach(table=>{
		$$('th',table).forEach(th=>{
			var colName = th.innerText.trim();
			var index = th.cellIndex;
			$$(`td:nth-child(${index+1})`,table).forEach(td=>{
				td.setAttribute('data-col',colName);
			});
		})
	});

	$$('img[data-src]').forEach(img=>{
		// if(img.hasAttribute('src')) return;
		var prepend = img.hasAttribute('data-src-prepend')?img.getAttribute('data-src-prepend'):'';
		img.src = prepend+(img.getAttribute('data-src').replace(/^[./]*/,''));
	});

	$$('a[href^=http]').forEach(a=>{
		if(a.hasAttribute('target')) return;
		if(a.getAttribute('href').indexOf(location.host)==-1){
			a.setAttribute('target','_blank');
		}
	});

});


if('IntersectionObserver' in window){
	var observer = new IntersectionObserver(function(entries) {
		var timeout = 0;
		entries.forEach(function(entry){
			if(entry.isIntersecting !== true) return;
			setTimeout(function(){
				entry.target.setAttribute('data-effect','');
				observer.unobserve(entry.target);
			},timeout);
			timeout += 100;
		})
	}, { threshold: [0.3] });

	$$('[data-effect]').forEach(function(elm){
		observer.observe(elm);
	});

} else {
	$$('[data-effect"]').forEach(function(elm){
		elm.setAttribute('data-effect','');
	})
}


//toggle open/close menu
subscribe('click',function(e){
	if(!e.target.matches('.toggle-menu')) return;
	var nav = e.target.closest('nav')
	if(!nav) return;
	if(nav.classList.contains('active')){
		nav.classList.remove('active');
		notify('nav-close',nav);
	} else {
		nav.classList.add('active');
		notify('nav-open',nav);
	}
});

//close menu after clicking any link
subscribe('click',function(e){
	if(!e.target.matches('nav a')) return;
	var nav = e.target.closest('nav.active')
	if(!nav) return;
	nav.classList.remove('active');
	notify('nav-close',nav);
});


//.modal-close click
subscribe('click',function(e){
	if(!e.target.matches('.modal-close')) return;
	var modal = e.target.closest('.modal-active')
	if(!modal) return;
	modal.classList.remove('modal-active');
	notify('modal-close',modal);
});


//close modal when clicking outside
subscribe('click',function(e){
	if(!e.target.matches('.modal-active')) return;
	var modal = e.target;
	modal.classList.remove('modal-active');
	notify('modal-close',modal);
});


//close modal when pressing ESC
subscribe('keyup',(e)=>{
	if(e.key!=='Escape') return;
	var modal = $('.modal-active');
	if(!modal) return;
	modal.classList.remove('modal-active');
	notify('modal-close',modal);
});


//stop playing youtube/vimeo vimeo
subscribe('modal-close',(modal)=>{
	modal.querySelectorAll('iframe[src*="youtube"]').forEach(iframe=>iframe.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*'));
	modal.querySelectorAll('iframe[src*="vimeo"]').forEach(iframe=>iframe.contentWindow.postMessage('{"method":"unload"}','*'));
});

//open modal
subscribe('click',function(e){
	if(!e.target.matches('a[href*="#modal-"], a[href*="#modal-"] *')) return;

	var el = e.target.closest('a');
	var match = el.getAttribute('href').match(/#modal-(block\d+)/);
	if(!match) return;

	var block_uid = match[1];
	var modal = $('.block-'+block_uid+' .modal');
	if(!modal) return;
	e.preventDefault();

	modal.classList.add('modal-active');
	var reference = el.closest('[x-for]');

	var btnMail = modal.querySelector('.btn-submit-email');
	if(!reference || !btnMail) return;

	var text = '';
	reference.querySelectorAll('td').forEach(td=>{
		var field = td.getAttribute('data-col');
		var value = td.innerHTML.replace(/<.*>/g,'').trim();
		if(value){
			text += `${field}: ${value}\n`;
		}
	});
	btnMail.setAttribute('data-append',text);

});


//open modal and add row info
subscribe('click',function(e){
	if(!e.target.matches('a[href*="{row}"], a[href*="{row}"] *')) return;

	var el = e.target.closest('a');

	var modal = el.closest('.modal');
	if(modal){
		var reference = modal.querySelector('[data-row]');
		if(reference) {
			e.stopPropagation();
			var text = "\n" + (reference.innerText.trim()) + "\n";
			text = encodeURIComponent(text);
			var href = el.getAttribute('href');
			el.setAttribute('href',href.replace('{row}',text));
			setTimeout(()=>{
				el.setAttribute('href',href);
			},1000)
			return;
		}
	}

	var reference = el.closest('[x-for]');
	if(reference) {
		e.stopPropagation();
		var text = '';
		reference.querySelectorAll('td').forEach(td=>{
			var field = td.getAttribute('data-col');
			var value = td.innerHTML.replace(/<.*>/g,'').trim();
			if(value){
				text += `\n${field}: *${value}*`;
			}
		});
		if(!text && reference.querySelector('[data-row]')){
			text = reference.querySelector('[data-row]').innerText.trim();
		}
		text += `\n`;
		text = encodeURIComponent(text);
		var href = el.getAttribute('href');
		el.setAttribute('href',href.replace('{row}',text));
		return;
	}

	var reference = window.document.querySelector('[data-row]');
	if(reference) {
		e.stopPropagation();
		var text = "\n" + (reference.innerText.trim()) + "\n";
		text = encodeURIComponent(text);
		var href = el.getAttribute('href');
		el.setAttribute('href',href.replace('{row}',text));
		return;
	}

});


window.isMobile = function(){
	if(window.navigator.userAgent.match(/Android/i)) return true;
	if(window.navigator.userAgent.match(/iPhone|iPad/i)) return true;
	return false;
}


notify('domLoaded');

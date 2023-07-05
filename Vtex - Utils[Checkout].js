import axios from 'axios';
import {
	getOrderForm,
	reloadOrderForm,
	setAddress,
	updateOrderForm,
	salesChannelChanged,
	getProfileByEmail,
	awaitOrderForm,
	completeAddress,
	sanitizeString
} from './utils-vtex';

let cache = null;

const { FKS } = CONFIG;

const browserInfoNames = {
	email: 'sp-email',
	polygons: 'FZ-polygons',
	saleChannel: 'store-sale-channel',
	method: 'store-method',
	store: 'store-name',
	address: 'store-address',
	addressId: 'store-address-id',
	vtexSC: 'VTEXSC'
};
export const browserInfo = {
	get: {
		email: () => window.store.get(browserInfoNames.email),
		polygons: () => window.store.get(browserInfoNames.polygons),
		saleChannel: () => Fizzmod.Utils.getCookie(browserInfoNames.saleChannel),
		method: () => Fizzmod.Utils.getCookie(browserInfoNames.method),
		address: () => {
			const data = Fizzmod.Utils.getCookie(browserInfoNames.address);
			if(!data)
				return data;
			return JSON.parse(decodeURI(data));
		},
		addressId: () => Fizzmod.Utils.getCookie(browserInfoNames.addressId),
		store: () => Fizzmod.Utils.getCookie(browserInfoNames.store),
		vtexSC: () => Fizzmod.Utils.getCookie(browserInfoNames.vtexSC)
	},
	set: {
		email: data => window.store.set(browserInfoNames.email, data),
		polygons: data => window.store.set(browserInfoNames.polygons, data),
		saleChannel: (data, expire) => (
			Fizzmod.Utils.setCookie(browserInfoNames.saleChannel, data, expire)
		),
		method: (data, expire) => Fizzmod.Utils.setCookie(browserInfoNames.method, data, expire),
		address: (data, expire) => {
			const dataToSave = encodeURI(JSON.stringify(data));
			return Fizzmod.Utils.setCookie(browserInfoNames.address, dataToSave, expire);
		},
		addressId: (data, expire) => Fizzmod.Utils.setCookie(browserInfoNames.addressId, data, expire),
		store: (data, expire) => Fizzmod.Utils.setCookie(browserInfoNames.store, data, expire),
		vtexSC: (data, expire) => Fizzmod.Utils.setCookie(browserInfoNames.vtexSC, data, expire)
	}
};

const changeToPromise = request => new Promise((resolve, reject) => {
	request
		.done(resolve)
		.fail(reject);
});

const setVtexScCookie = salesChannel => browserInfo.set.vtexSC(`sc=${salesChannel}`, 30);
const getVtexScCookie = () => {
	const cookie = browserInfo.get.vtexSC() || '';
	const scCookie = cookie.replace('sc=', '');

	let response;
	if(scCookie)
		response = scCookie;
	else
		response = window.vtexjs.checkout.orderForm.salesChannel;

	if(typeof response === 'number')
		return response;

	return parseInt(response, 10);
};

export function getQueryString(key) {
	const temp = key.replace(/[[\]]/g, '\\$&');
	const regex = new RegExp(`[?&]${temp}(=([^&#]*)|&|#|$)`);
	const results = regex.exec(window.location.href);

	if(!results)
		return null;

	if(!results[2])
		return '';

	return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function getData() {
	return new Promise((resolve) => {
		if(cache)
			resolve(cache);
		else {
			axios('/files/PE-districts.json')
				.then((response) => {
					cache = response.data;
					resolve(cache);
				});
		}
	});
}

let storesCache = [];

export const getStores = () => new Promise((resolve) => {
	if(storesCache.length)
		resolve(storesCache);

	getData()
		.then((data) => {
			storesCache = data;
			resolve(data);
		});
});

const redirToChange = (sc) => {
	let newSearch;
	if(sc)
		newSearch = Fizzmod.Utils.buildQueryString(['sc', 'spChangeSC'], [sc, 1]);
	else
		newSearch = Fizzmod.Utils.buildQueryString('spChangeSC', 1);
	const reload = window.location.search === newSearch;

	window.location.search = newSearch;

	// Reload and clear search query to avoid reloading loops
	if(reload)
		window.location.search = '';
};

const getDataSelector = () => {
	const name = decodeURI(browserInfo.get.store());
	const method = decodeURI(browserInfo.get.method());
	const sc = browserInfo.get.saleChannel();
	const address = browserInfo.get.address();

	return {
		sc,
		name,
		method,
		address
	};
};

export const formatCookieAddress = (address) => {
	if(!address)
		return address;

	const response = {};
	const exclude = ['addressId', 'addressName', 'complement', 'city', 'state', 'neighborhood'];
	Object.keys(address).forEach((key) => {
		if(exclude.indexOf(key) === -1)
			response[key] = sanitizeString(address[key]);
		else
			response[key] = address[key];
	});
	return response;
};

export const setSalesChannel = (address, store, method, callback = () => {}, isPollos = false) => {
	const { salesChannel, name, id } = store;
	const realSC = isPollos ? FKS.callcenterSalesChannel : salesChannel;
	const isSalesChannelChanged = salesChannelChanged(realSC);
	const inCheckout = /checkout/.test(window.location.href);

	const addressCookie = formatCookieAddress(address);

	// const { loggedIn } = vtexjs.checkout.orderForm;

	// if(address && loggedIn)
	if(address)
		setAddress(addressCookie);
	// else if(address && !loggedIn)
		// console.error('Usuario no logeado.');

	// Set store cookies
	browserInfo.set.store(encodeURI(name), 30);
	browserInfo.set.method(encodeURI(method), 30);
	browserInfo.set.saleChannel(salesChannel, 30);
	browserInfo.set.address(addressCookie || '', 30);

	let promise;
	if(isPollos) {
		const storeId = id.split('_')[0];
		const { orderFormId } = vtexjs.checkout;
		promise = changeToPromise(Fizzmod.MasterData.insertUpdate(orderFormId, { store: storeId }, 'OI'));
	} else
		promise = new Promise(resolve => setTimeout(resolve, 2500));

	promise
		.then(() => {
			// Sets Vtex cookie
			setVtexScCookie(realSC);

			if(inCheckout || isSalesChannelChanged) {
				if(inCheckout) {
					updateOrderForm(realSC).then(() => {
						callback();
						redirToChange();
					});
				} else {
					// Reloads to complete change
					callback();
					redirToChange(realSC);
				}
			} else {
				// Just hides modal
				callback();
			}
		});
};

export const init = async() => {
	try {
		const {
			sc,
			name: storeName,
			method: storeMethod,
			address
		} = getDataSelector();

		const stores = await getStores();
		const orderForm = await awaitOrderForm();

		if(stores && orderForm) {
			const store = stores.find(st => (
				st.name === storeName && parseInt(st.salesChannel, 10) === sc
			));
			const vtexSC = getVtexScCookie();

			if(store && vtexSC !== parseInt(FKS.callcenterSalesChannel, 10) && vtexSC !== sc) {
				console.error('Different sales channels');
				setSalesChannel(address, store, storeMethod);
			}

			return {
				store,
				method: storeMethod,
				address
			};
		}
	} catch(e) {
		console.error('init error: ', e);
	}
};

export function isLoggedIn(withRequest = false) {
	return new Promise((resolve) => {
		if(!withRequest) {
			getOrderForm()
				.then(({ clientProfileData, loggedIn }) => {
					resolve({
						fake: (!!clientProfileData && !!clientProfileData.email),
						real: loggedIn
					});
				});
		} else {
			Fizzmod.Utils.checkLogin()
				.always((res) => {
					getOrderForm()
						.then(({ clientProfileData }) => {
							resolve({
								fake: (!!clientProfileData && !!clientProfileData.email),
								real: (res && typeof res.IsUserDefined !== 'undefined' && res.IsUserDefined)
							});
						});
				});
		}
	});
}

export function logout(vtexLogout) {
	browserInfo.set.email('');

	if(vtexLogout)
		window.$.get(vtexjs.checkout.getLogoutURL()).always(() => { window.location = '/logout'; });
}

export function getEmail() {
	if(window.vtexjs.checkout.orderForm && window.vtexjs.checkout.orderForm.clientProfileData) {
		const { clientProfileData: { email } } = window.vtexjs.checkout.orderForm;
		if(email)
			return email;
	}

	const spEmail = browserInfo.get.email();
	return spEmail;
}

const formatCoordinates = coordinates => coordinates.map(([lng, lat]) => ({ lng, lat }));

const mergePolygons = (stores, polygons) => (
	stores.map((st) => {
		const stPolygons = polygons.filter(p => st.maps && st.maps.includes(p.name));
		if(stPolygons && stPolygons.length) {
			return Object.assign({}, st, {
				paths: stPolygons.map(({ coordinates }) => formatCoordinates(coordinates[0]))
			});
		}
		return st;
	})
);

const getPolygons = stores => new Promise((resolve, reject) => {
	const stPolygons = browserInfo.get.polygons();

	if(stPolygons)
		resolve(mergePolygons(stores, stPolygons));
	else {
		Fizzmod.MasterData.setStore(FKS.environment);
		Fizzmod.MasterData.search({}, ['name', 'coordinates'], 'GS', 500)
			.done((res) => {
				const polygons = res.getResults();
				browserInfo.set.polygons(polygons);
				resolve(mergePolygons(stores, polygons));
			})
			.fail(reject);
	}
});

const getSaleChannelByZip = zip => new Promise((resolve) => {
	const cp = typeof zip === 'string' ? parseInt(zip, 10) : zip;
	getStores()
		.then((stores) => {
			const store = stores.find(st => !!st.zipList && st.zipList.includes(cp));
			if(store && store.salesChannel)
				resolve(store);
			else
				resolve(null);
		});
});

function getSaleChannelByGeoShapes(geoCoordinates) {
	return new Promise((resolve) => {
		// Currents address
		if(!geoCoordinates)
			resolve(null);

		const [lng, lat] = geoCoordinates;

		getStores()
			// Complement stores with polygons
			.then(stores => getPolygons(stores))
			.then((storesWithPaths) => {
				const store = storesWithPaths.find(({ paths }) => {
					if(!paths)
						return false;

					return paths.some(pth => (
						google.maps.geometry.poly.containsLocation(
							new google.maps.LatLng(lat, lng),
							new google.maps.Polygon({ paths: pth })
						)
					));
				});

				if(store)
					resolve(store);
				else
					resolve(null);
			});
	});
}

export const getSaleChannelByAddress = address => new Promise((resolve) => {
	if(address.geoCoordinates && address.geoCoordinates.length) {
		getSaleChannelByGeoShapes(address.geoCoordinates)
			.then((store) => {
				resolve({
					addressId: address.addressId,
					store,
					sc: store ? store.salesChannel : null
				});
			});
	} else {
		getSaleChannelByZip(address.postalCode)
			.then((store) => {
				resolve({
					addressId: address.addressId,
					store,
					sc: store ? store.salesChannel : null
				});
			});
	}
});

function getUserByEmail(email) {
	return new Promise((resolve, reject) => {
		Fizzmod.MasterData.getUser(email, ['id', 'firstName', 'lastName'])
			.always((response) => {
				if(response.isOK()) {
					const userData = response.getResults();
					resolve(userData);
				} else if(response.getMessage() === 'User doesn\'t exist') {
					Fizzmod.MasterData.insertUpdateUser(email)
						.done((resp) => {
							const { Id: id } = resp.getResults();
							resolve({ id });
						})
						.fail(reject);
				} else
					reject(response.getMessage());
			});
	});
}

export const insertAddress = (email, address) => new Promise((resolve, reject) => {
	getUserByEmail(email).then(({ id, firstName, lastName }) => {
		const name = !firstName ? '' : firstName;
		const lastname = !lastName ? '' : lastName;

		const newAddress = completeAddress(Object.assign({}, address, { receiverName: `${name} ${lastname}` }), 'MasterData');

		const data = Object.assign({}, newAddress, {
			userId: id.replace('CL-', '')
		});


		Fizzmod.MasterData.insert(data, 'AD')
			.always((response) => {
				if(response.isOK()) {
					reloadOrderForm().then(() => {
						const newAddressFormatted = completeAddress(newAddress);
						resolve(newAddressFormatted);
					});
				} else
					reject(response);
			});
	});
});

export function addProductPaused(arraySkus, sc) {
	if(arraySkus && arraySkus.length && sc)
		window.vtexjs.checkout.addToCart(arraySkus, null, sc);
}

function serializeObj(obj) {
	const arrayData = [];

	Object.keys(obj).forEach((key) => {
		let data = '';
		if(Array.isArray(obj[key])) {
			const isValid = obj[key].every(val => (typeof val === 'string' || typeof val === 'number'));
			if(isValid)
				data = obj[key].map(val => encodeURIComponent(val)).join(',');
			else
				data = JSON.stringify(obj[key]);
		} else if(typeof obj[key] === 'object')
			data = serializeObj(obj[key]);
		else
			data = encodeURIComponent(obj[key]);
		arrayData.push(`${encodeURIComponent(key)}=${data}`);
	});

	return arrayData.join('&');
}

export function addUrlParam(url, data) {
	const stringData = serializeObj(data);

	if(url.indexOf('?') !== -1 && url.indexOf('#') !== -1) {
		const arrUrl = url.split('#');
		return `${arrUrl[0]}&${stringData}#${arrUrl[1]}`;
	}
	if(url.indexOf('?') !== -1)
		return `${url}&${stringData}`;
	if(url.indexOf('#') !== -1) {
		const arrUrl = url.split('#');
		return `${arrUrl[0]}?${stringData}#${arrUrl[1]}`;
	}
	return `${url}?${stringData}`;
}

const setProfileData = async(user) => {
	try {
		if(!user)
			throw new Error('setProfileData: data empty.');

		const response = await window.vtexjs.checkout.sendAttachment('clientProfileData', user);
		return response;
	} catch(e) {
		throw e;
	}
};

export function getAddresses(email) {
	browserInfo.set.email(email);

	return new Promise((resolve) => {
		getProfileByEmail(email)
			.then((user) => {
				const { availableAddresses, userProfile } = user;

				let setProfile;

				/*
				if(userProfile)
					setProfile = setProfileData(userProfile);
				else
					setProfile = $.Deferred().resolve().promise();
				*/

				setProfile = $.Deferred().resolve().promise();

				const promises = availableAddresses.map((address) => {
					if(address.geoCoordinates && address.geoCoordinates.length)
						return Promise.resolve({ exclude: true });
					return changeToPromise(Fizzmod.MasterData.search({ addressName: address.addressId }, ['addressName', 'geoCoordinate'], 'AD'));
				});

				Promise.all([setProfile, ...promises])
					.then((responses) => {
						const dataResponses = responses.map((data, index) => {
							if(index !== 0 && !data.exclude)
								return data.getResults();
							return null;
						}).filter(f => !!f);

						const editedAddresses = availableAddresses.map((address) => {
							if(!address.geoCoordinates || !address.geoCoordinates.length) {
								const geoMD = dataResponses
									.find(d => d[0] && d[0].addressName === address.addressId);

								if(geoMD) {
									return Object.assign({}, address, {
										geoCoordinates: geoMD[0].geoCoordinate
									});
								}
							}
							return address;
						});

						resolve(editedAddresses);
						/*
						if(!/checkout/.test(window.location.href))
							resolve(editedAddresses);
						else {
							// add SC to addresses
							const promises2 = editedAddresses.map(address => getSaleChannelByAddress(address));

							Promise.all(promises2)
								.then((data) => {
									const editedAddresses2 = editedAddresses.map((address) => {
										const { sc } = data.find(d => d.addressId === address.addressId);
										return Object.assign({}, address, { sc });
									});
									resolve(editedAddresses2);
								});
						}
						*/
					})
					.catch((e) => {
						console.error(e);
					});
			})
			.catch(error => console.error('getProfileByEmail: ', error));
	});
}

export const updateAddressCheckout = dispatch => () => {
	const { address } = window.vtexjs.checkout.orderForm.shippingData;
	if(!address)
		return;

	const { addresses } = window.storeRedux.getState().shippingPreference;

	getSaleChannelByAddress(address)
		.then(({ sc }) => {
			const actualAddress = addresses.find(a => a.addressId === address.addressId);
			let newAddresses;
			if(actualAddress) {
				newAddresses = [
					Object.assign({}, actualAddress, address, { sc }),
					...addresses.filter(a => a.addressId !== address.addressId)
				];
			} else {
				newAddresses = [
					Object.assign({}, address, { sc }),
					...addresses
				];
			}

			dispatch({
				type: 'shippingPreference/SET_DATA',
				attr: 'addresses',
				value: newAddresses
			});
		});
};

function checkSla(validation, shippingData, addressParam) {
	return new Promise((resolve, reject) => {
		if(!shippingData || !shippingData.logisticsInfo.length)
			resolve(true);
		else {
			const { selectedSla, slas } = shippingData.logisticsInfo[0];
			if(selectedSla && !validation.test(selectedSla.toLowerCase())) {
				const newSla = slas.find(sla => validation.test(sla.id.toLowerCase()));
				let newSelectedSla = '';
				if(newSla)
					newSelectedSla = newSla.id;
				else if(slas[0])
					newSelectedSla = slas[0].id;

				const { address, logisticsInfo } = shippingData;

				const newShippingData = {
					address: !addressParam ? address : addressParam,
					logisticsInfo: logisticsInfo.map(info => Object.assign({}, info, {
						selectedSla: newSelectedSla
					})),
					clearAddressIfPostalCodeNotFound: undefined
				};

				window.vtexjs.checkout.sendAttachment('shippingData', newShippingData)
					.done(resolve)
					.fail((error) => {
						console.error('sendAttachment error:', error);
						reject(error);
					});
			} else
				resolve(true);
		}
	});
}

const checkProfile = async(clientProfileData) => {
	/*
	let promiseProfile;
	const email = getEmail();

	if(clientProfileData && clientProfileData.email && clientProfileData.email === email)
		promiseProfile = $.Deferred().resolve().promise();
	else {
		const { userProfile } = await getProfileByEmail(email);
		if(userProfile)
			promiseProfile = setProfileData(userProfile);
		else
			promiseProfile = $.Deferred().resolve().promise();
	}
	promiseProfile = $.Deferred().resolve().promise();
	 */
	const promiseProfile = $.Deferred().resolve().promise();

	return promiseProfile;
};

export const checkDataSetted = async() => {
	try {
		const { store: storeSetted, method, address } = await init();
		const { clientProfileData, shippingData } = await awaitOrderForm(orderForm => (
			orderForm.salesChannel === storeSetted.salesChannel
		));

		const promiseProfile = await checkProfile(clientProfileData);

		if(promiseProfile) {
			let promise;
			let stringSearch;

			if(method === 'delivery')
				stringSearch = /domicilio/;
			else
				stringSearch = method === 'storepickup' ? /retiro/ : /auto/;

			if(address.addressId !== shippingData.address.addressId)
				promise = await checkSla(stringSearch, shippingData, address);
			else
				promise = await checkSla(stringSearch, shippingData);

			return promise;
		}
	} catch(e) {
		console.error(e);
		return e;
	}
};


/**
 * According to the validation, it executes the callback or waits for the animation to be activated
 *
 * @param  {string} animation - CSS animation name
 * @param  {Function} callback
 * @param  {Boolean} validation - If true execute the callback, else await animation
 *
 * @return {[type]}
 */
export const onceTriggerAnimation = (animation, callback, validation = false) => {
	let interceptCallback = () => {
		interceptCallback = () => {};
		callback();
	};

	if(validation)
		callback();
	else
		Fizzmod.Utils.addAnimation(animation, interceptCallback);
};

export const getMobileOperatingSystem = () => {
	const userAgent = navigator.userAgent || navigator.vendor || window.opera;

	// Windows Phone must come first because its UA also contains "Android"
	if(/windows phone/i.test(userAgent))
		return 'Windows Phone';

	if(/android/i.test(userAgent))
		return 'Android';

	if(/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream)
		return 'iOS';

	return 'unknown';
};

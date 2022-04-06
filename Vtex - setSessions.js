var fnAll = {
  generateEmptySession: function () {
    return $.Deferred(function() {
      var promise = this;
      let setJsonHeader = {
        public: {
          country: {
            value: 'ARG',
          },
          sc: {
            value: 1,
          },
          geoCoordinates: {
            value: '',
          },
          regionId: {
            value: null,
          },
        },
      };
      fnAll.setSessions(setJsonHeader).done(function(data) {
        promise.resolve(data);
      });
    });
  },
  setSessions: function(jsonHeader = '') {
    let setJsonHeader = jsonHeader == '' ? {} : JSON.stringify(jsonHeader);
    return $.Deferred(function() {
      var promise = this;
      fetch('/api/sessions/', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: setJsonHeader,
      })
        .then(function(e) {
          return e.json();
        })
        .then(function(response) {
          promise.resolve(response);
        });
    });
  },
  generateVtexSession: function(addressInfo={
    lon: '-58.5033882',
    lat: '-34.5209493'
  }) {
    return $.Deferred(function() {
      var promise = this;
      // Limpiamos el Sessions
      fnAll.generateEmptySession().done(function(data) {
        let setJsonHeader = {
          public: {
            country: {
              value: 'ARG',
            },
            sc: {
              value: 1,
            },
            geoCoordinates: {
              value: addressInfo.lon + ',' + addressInfo.lat,
            },
          },
        };
        console.log('setJsonHeader', setJsonHeader);
        // Enviamos las coodenadas, esperamos el REGIONID
        fnAll.setSessions(setJsonHeader).done(function(data) {
          promise.resolve(data);
          fnAll.getRegionId();
        });
      });
    });
  },
  getRegionId: function() {
    const newAddress = {
      addressType: 'search',
      postalCode: "",
      city: "Buenos Aires",
      state: "Buenos Aires",
      country: 'ARG',
      street: "Fernán Félix de Amador",
      number: '1',
      neighborhood: "Buenos Aires",
      complement: '',
      reference: "",
      geoCoordinates: ["-58.5033882", "-34.5209493"],
    };
    vtexjs.checkout
      .sendAttachment('shippingData', {
        clearAddressIfPostalCodeNotFound: false,
        address: newAddress,
        logisticsInfo: [],
      })
      .then(orderForm => {
        console.log('Yay! Workbox is loaded 🎉', orderForm.shippingData);
        var item = {
          id: 11,
          quantity: 1,
          seller: "1",
        }
        vtexjs.checkout.addToCart([item], null, 3).done(function(orderForm) {
          alert("Item added!")
          setTimeout(function() {
            window.location.href = window.location.pathname;
          }, 3e3);
        })
      });
  }
}


fnAll.generateVtexSession();

/*
 * message.js
 * This file contains your Flight Booking Code
 */

const rp = require('request-promise')

var aviationJson = require("aviation-json");
const airlines = aviationJson.airlines;
const {
  DOMParser
} = require('xmldom');
const xmlToJSON = require('xmlToJSON');
xmlToJSON.stringToXML = (string) => new DOMParser().parseFromString(string, 'text/xml');
const options = {
  mergeCDATA: true, // extract cdata and merge with text nodes
  grokAttr: true, // convert truthy attributes to boolean, etc
  grokText: true, // convert truthy text/attr to boolean, etc
  normalize: true, // collapse multiple spaces to single space
  xmlns: true, // include namespaces as attributes in output
  // tag for cdata nodes (ignored if mergeCDATA is true)
  attrsAsObject: true, // if false, key is used as prefix to name, set prefix to '' to merge children and attrs.
  stripAttrPrefix: true, // remove namespace prefixes from attributes
  stripElemPrefix: true, // for elements of same name in diff namespaces, you can enable namespaces and access the nskey property
  childrenAsArray: true // force children into arrays
};

const getAirportCode = (location) => {
  var options = {
    url: 'https://staging.musafir.com/Trip/Resource/Pages/Resolve/Default.ashx?mode=1&keyword=' + location,
  }
  return rp(options).then(body => {
    var result = xmlToJSON.parseString(body, options);
    var airportCityName = result.musafir[0].airports[0].airport[0]._text;
    var airportCode = airportCityName.substring(airportCityName.indexOf(";") + 1, airportCityName.indexOf('&', airportCityName.indexOf(";") + 1));
    return airportCode
  })
}

const getFlightDetails = (requestBody) => {
  var options = {
    method: 'POST',
    uri: 'https://staging.musafir.com/API/Search/?json=1',
    json: true,
    gzip: true,
    // headers : {
    //   'Accept-Encoding': 'gzip,deflate',
    //   'Content-Type':'application/json'
    // },
    body: {
      "POS": [{
        "RequestorID": {
          "Instance": "MobilePassword",
          "ID_Context": "MobileUsername"
        }
      }],
      "OriginDestinationInformation": [{
        "OriginLocation": {
          "LocationCode": requestBody.source
        },
        "DestinationLocation": {
          "LocationCode": requestBody.destination
        },
        "Item": {
          "Value": requestBody.departureDate
        }
      }],
      "SpecificFlightInfo": {
        "TPA_Extensions": {
          "SearchPreferencesExtensions": {
            "FlightResultsType": "Split",
            "IncludeFareDetailedBreakdowns": true
          }
        }
      },
      "TravelPreferences": [{
        "CabinPref": [{
          "Cabin": "Any"
        }]
      }],
      "TravelerInfoSummary": {
        "AirTravelerAvail": [{
          "PassengerTypeQuantity": [{
              "Code": "ADT",
              "Quantity": "1"
            },
            {
              "Code": "CHD",
              "Quantity": "0"
            },
            {
              "Code": "INF",
              "Quantity": "0"
            }
          ]
        }]
      },
      "EchoToken": "Ehtesham",
      "Target": "Test",
      "Version": 1.1,
      "MaxResponses": "200"
    }
  }
  return rp(options).then(result => {
    var error = '';
    var flights = [];
    if (result.Items[0].Error == undefined) {
      var allFlights = result.Items[1].PricedItinerary;
      var props = Object.keys(allFlights).map(function(key) {
        return {
          key: key,
          value: this[key]
        };
      }, allFlights);
      flights = props.slice(0, 5).reduce(function(obj, prop) {
        obj[prop.key] = prop.value;
        return obj;
      }, {});
    } else {
      error = result.Items[0].Error[0].Type
    }
    return {
      error: error,
      flights: flights
    };
  })
}

const getAirlineDetails = (airlineCode) => {
  var airlineDetails={}
  Object.keys(airlines).forEach(function(key) {
    var val = airlines[key];
    if(val.IATA==airlineCode){
      airlineDetails = val;
    }

  });
  return airlineDetails;
}

const formatAMPM=(date)=> {
  var hours = date.getHours();
  var minutes = date.getMinutes();
  var ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12;
  hours = hours ? hours : 12; // the hour '0' should be '12'
  minutes = minutes < 10 ? '0'+minutes : minutes;
  var strTime = hours + ':' + minutes + ' ' + ampm;
  return strTime;
}
const flightBooking = (result) => {
  if (result.memory.destination != null && result.memory.source != null) {

    return Promise.all([
      getAirportCode(result.memory.source.raw),
      getAirportCode(result.memory.destination.raw),
    ]).then(airports => {
      if (result.entities.datetime != null) {
        var date = new Date(result.entities.datetime[0].iso);
        var requestBody = {
          source: airports[1],
          destination: airports[0],
          departureDate: date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
        }
        console.log(requestBody);
        return Promise.all([
          getFlightDetails(requestBody)
        ]).then(data => {
          result.resetMemory();
          if (data[0].error.length) {
            return {
              type: 'text',
              content: data[0].error
            }
          } else {
            var flights = Object.keys(data[0].flights).map(function(key) {
              return data[0].flights[key];
            });
            var cards = [];
            for (var i = 0; i < flights.length; i++) {
              // console.log((flights[i].AirItineraryPricingInfo.PTC_FareBreakdowns[0].PassengerFare[0].TotalFare.Amount));
              var currency = flights[i].AirItineraryPricingInfo.PriceRequestInformation.CurrencyCode;
              var flightCode = flights[i].AirItinerary.OriginDestinationOptions[0].FlightSegment[0].OperatingAirline.Code;
              var Departure = formatAMPM(new Date(flights[i].AirItinerary.OriginDestinationOptions[0].FlightSegment[0].DepartureDateTime));
              var Arrival = formatAMPM(new Date(flights[i].AirItinerary.OriginDestinationOptions[0].FlightSegment[0].ArrivalDateTime));
              var flightNumber = flights[i].AirItinerary.OriginDestinationOptions[0].FlightSegment[0].FlightNumber;
              var totalDurationInMinutes = flights[i].AirItinerary.OriginDestinationOptions[0].TotalDurationInMinutes;

              var airlineDetails=getAirlineDetails(flightCode);
              var price= currency +' ';
              var name='';
              var logoLink='';
              if(airlineDetails!=undefined && airlineDetails!=null){
                name=airlineDetails.name;
                logoLink=airlineDetails.logoLink;
              } else {
                name=flightCode;
                console.log('details not found for '+flightCode)
              }
              // var titleName=airlineDetails.name!=undefined?airlineDetails.name:flightCode;
              var flightCard = {
                title: name + '( Flight No: ' + flightNumber + ' )',
                imageUrl : logoLink,
                subtitle: Departure + ' - ' + Arrival + ' ( ' + totalDurationInMinutes + 'mins ) ',
                buttons: [{
                  title: 'Book Flight',
                  type: 'web_url',
                  value: 'https://assets-cdn.github.com/images/modules/logos_page/Octocat.png',
                }]
              }
              cards.push(flightCard);
            }

            return {
              type: 'list',
              content:  {
    elements:cards
            }
          }
          }
        })


      } else {
        return {
          type: 'text',
          content: `When do you wanna travel?`
        }
      }
    })
  } else {
    return Promise.resolve({
      type: 'text',
      content: 'Please enter a valid Source and Destination'
    })

  }

}

module.exports = flightBooking
//
//
//
// var Client = require('node-rest-client').Client;
//
//
//  var  flightBookingDetails=new FlightBookingPrerequisite();
//
//
// var FlightBooking=(function(){
//   var result={};
//   var message={};
//   let BookAFlight=function(result,message){
//     this.result=result;
//     this.message=message;
//     flightBookingDetails=PopulateFlightBookingPrerequisites(result);
//     console.log(flightBookingDetails);
//   }
// })();
//
//
// function PopulateFlightBookingPrerequisites(result){
//   var LocalFlightBookingDetails=new FlightBookingPrerequisite();
//   return LocalFlightBookingDetails;
// }
//
// function FlightBookingPrerequisite(){
//   this.source='';
//   this.destination='';
//   this.tripType=0;
//   this.noOfAdults=0;
//   this.noOfChilds=0;
//   this.departureDate='';
//   this.returnDate='';
// }
//
//
// module.exports = FlightBooking

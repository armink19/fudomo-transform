const { loadModel, loaders, CenteredModel, ObjectModel } = require('./model-io.js');

class MetamodelInferer {
  inferMetamodelFromPaths(instancePaths, initialMetamodel = null) {
    const instances = instancePaths.map(path => loadModel(path));
    return this.inferMetamodel(instances);
  }

  inferMetamodel(objectModels, initialMetamodel = null) {
    const metamodel = initialMetamodel || {};

    const visited = new Set();
    const open = objectModels.map(centeredModel => centeredModel.center);
    

    while (open.length > 0) {
      const obj = open.pop();
      if (visited.has(obj.id)) continue;
      visited.add(obj.id);

      if (metamodel[obj.type] == undefined) {
        metamodel[obj.type] = new Set();
      }

      if (obj.isScalar) {
        let scalarType = obj.scalarType;
        metamodel[obj.type].add(JSON.stringify({ 'scalarType': scalarType }));
      } else {
        let internalID=1;
        for (const featureName of obj.featureNames) {
          const values = obj.getFeatureAsArray(featureName);
          
          for (const value of values) {
            debugger;
            let featureSpecs = metamodel[obj.type];
            let refType = null;
            let typeDesc = null;
            let id= null;
            let cardinality = null;
            if (featureName == 'cont') {
              refType = 'containment';
              typeDesc = value.type;
              let ids=(value.id.substr(5,value.id.length-1)).split(".");
              id=ids[0];
              cardinality = value.refId;
      
   
            } else if (value instanceof ObjectModel) {
              refType = 'reference';
              typeDesc = value.type;
              let ids=(value.id.substr(5,value.id.length-1)).split(".");
              id=ids[0];
              cardinality = value.refId;
             
            } else {
              refType = 'attribute';
              let ids=(obj.id.substr(5,obj.id.length-1)).split(".");
              id=ids[0];
              typeDesc = obj.getAttributeType(featureName);
              cardinality = obj.refId;
              if (Array.isArray(typeDesc)) {
                typeDesc = { seq: Array.from(new Set(typeDesc)) };
                cardinality =obj.refId;
              }
            }
            
            featureSpecs.add(JSON.stringify({ 'name': featureName, 'referenceType': refType, 'objectType': typeDesc, 'refId': cardinality,  'id':id, 'internalID':id+'.'+internalID }));

            if (value instanceof ObjectModel) {
              open.push(value);
              
            }
            
          }
         
        }
        internalID++;
      }
    }

    

    const result = new Map();
    let objectModelsbyID = new Map();
    let cardRef= new Set();
    let cardCont= new Set();
    let cardAttr= new Set();
    for (const objectType of Object.keys(metamodel)) {
      
      const featureSpecs = Array.from(metamodel[objectType] || []).map(json => JSON.parse(json));
      if (featureSpecs.length == 0) continue;

      if (featureSpecs.every(s => s.scalarType !== undefined)) {
        // Scalars
        const scalarTypes = featureSpecs.map(s => s.scalarType);
        if (scalarTypes.length == 0) {
          result.set(objectType, null);
        } else if (scalarTypes.length == 1) {
          result.set(objectType, scalarTypes[0]);
        } else {
          result.set(objectType, scalarTypes);
        }
        continue;
      }

      // Objects
      const objectResult = new Map();
      const cardinalityResult= {};
      result.set(objectType, objectResult);

      const attrFeatures = featureSpecs.filter(spec => spec.referenceType == 'attribute');
      const contFeatures = featureSpecs.filter(spec => spec.referenceType == 'containment');
      const refFeatures = featureSpecs.filter(spec => spec.referenceType == 'reference');
     
      const possibleId = new Set()

      for (const feature of featureSpecs){
        if (feature.id!=undefined){
        possibleId.add(feature.id);}
     
      }


      for (const object_id of possibleId){
         
        let tempFeatures = featureSpecs.filter(spec => spec.id == object_id);
        objectModelsbyID.set(object_id,tempFeatures);}
       
      const attrFeatureNames = Array.from(new Set(attrFeatures.map(spec => spec.name))).sort();
      const contFeatureNames = Array.from(new Set(contFeatures.map(spec => spec.name))).sort();
      const refFeatureNames = Array.from(new Set(refFeatures.map(spec => spec.name))).sort();
 

      for (const attrName of attrFeatureNames) {
      for (const value of objectModelsbyID.values()) {
      const count = value.filter((obj) => obj.name === attrName).length;
      cardAttr.add({name:attrName,count:count});}
      }

      // Attributes
      for (const attrName of attrFeatureNames) {
        let possibleTypes = objectResult.get(attrName);
        let max=0;
        let min=0;
        if (possibleTypes == null) {
          possibleTypes = new Set();
          objectResult.set(attrName, possibleTypes);
          
        }
        if(featureSpecs.filter((obj) => obj.name === attrName).length==1){
        max = 1;
        min = 1;} else {
          max=1; min=0;
        }
        cardinalityResult[attrName]= '['+min+'..'+max+']';
        for (const spec of attrFeatures.filter(spec => spec.name == attrName)) {
          possibleTypes.add(spec.objectType+' '+ cardinalityResult[attrName]);
        }
      }

      for (const cont of contFeatures) {
        for (const value of objectModelsbyID.values()) {
          const count = value.filter((obj) => obj.name === cont.name).length;
          cardCont.add({name:cont.name,objectType:cont.objectType,count:count});}
          //debugger;
      }

      // Cont
      for (const cont of contFeatures) {
        let possibleTypes = objectResult.get(cont.name);
        if (possibleTypes == null) {
          possibleTypes = new Set();
          objectResult.set(cont.name, possibleTypes);
        }
        let numbers= new Set();
        for(const val of cardCont){
        if(val.objectType== cont.objectType){
          numbers.add(val.count);}}

        let min=Array.from(numbers).reduce((a, b) => Math.min(a, b), Infinity);
        let max=Array.from(numbers).reduce((a, b) => Math.max(a, b), -Infinity);
        cardinalityResult[cont.name]= '['+min+'..'+max+']';
        for (const spec of contFeatures.filter(spec => spec.name == cont.name)) {
          if(cardinalityResult[cont.name]!=undefined){
          possibleTypes.add(spec.objectType+' '+ cardinalityResult[cont.name]);}} 
      }

   /*   // References
     for (const refName of refFeatureNames) {
        let possibleTypes = objectResult.get(refName);
        if (possibleTypes == null) {
          possibleTypes = new Set();
          objectResult.set(refName, possibleTypes);
        }
        const max = featureSpecs.filter((obj) => obj.name === refName).length;
        //cardinalityResult.set(refName, '[1..'+max+']');
        cardinalityResult[refName]= '[1..'+max+']'
        for (const spec of refFeatures.filter(spec => spec.name == refName)) {
          //possibleTypes.set(spec.objectType,cardinalityResult.get(refName));
          possibleTypes.add(spec.objectType+' '+ cardinalityResult[refName]);
        }
      }*/
      for (const refName of refFeatureNames) {
        for (const value of objectModelsbyID.values()) {
          const count = value.filter((obj) => obj.name === refName).length;
          cardRef.add({name:refName,count:count});}
      }
      
          // References
      for (const refName of refFeatureNames) {
        let possibleTypes = objectResult.get(refName);
        if (possibleTypes == null) {
          possibleTypes = new Set();
          objectResult.set(refName, possibleTypes);
        }      
        let numbers= new Set();
        for(const val of cardRef){
        if(val.name== refName){
          numbers.add(val.count);}}

        let min=Array.from(numbers).reduce((a, b) => Math.min(a, b), Infinity);
        let max=Array.from(numbers).reduce((a, b) => Math.max(a, b), -Infinity);
        cardinalityResult[refName]= '['+min+'..'+max+']';
        for (const spec of refFeatures.filter(spec => spec.name == refName)) {
          if(cardinalityResult[refName]!=undefined){
          possibleTypes.add(spec.objectType+' '+ cardinalityResult[refName]);}}
      }
        
     
    }
    
   //debugger;
    // Sort possible types
    for (const objectType of result.keys()) {
      const objectSpec = result.get(objectType);
      if (objectSpec instanceof Map) {
        for (const featureName of objectSpec.keys()) {
          const possibleTypes = objectSpec.get(featureName);
          objectSpec.set(featureName, Array.from(possibleTypes).sort());
        }
      }
     
    }

    return result;
  }
}

const checkOccurrence = (array, element) => {
  let counter = 0;
  for (item of array.flat()) {
      if (item == element) {
          counter++;
      }
  };
  console.log(counter);
};

const SCALAR_TYPES = new Set(['int', 'float', 'bool', 'string', 'null']);

class Validator {
  constructor(metamodel, markerContextType) {
    this.metamodel = metamodel;
    this.markerContextType = markerContextType;
  }

  makeError(context, message, location=null) {
    return { context: context, message: message, markerContext: { type: this.markerContextType, location: location || [[0, 0], [0, 0]] } };
  }

  typeExists(type) {
    if (SCALAR_TYPES.has(type)) return true;
    if (type === 'Object' || type === 'Root') return true;
    return this.metamodel[type] !== undefined;
  }

  _isAlwaysValidFeature(type, attrName) {
    if (attrName === 'val' || attrName === 'center') {
      return true;
    }
    if (type === 'Root' && attrName === 'cont') {
      return true;
    }
    if (type === 'Object') {
      return true;
    }
    return false;
  }
  
  _getAttributeOrRefTypeSpec(type, attrName) {
    const typeSpec = this.metamodel[type] || {};
    let str= typeSpec[attrName];
    let result= str[0].split(" ");
    let bounds= result[1].substr(1,result[1].length-2).split("..");
    return result[0];
  }

  _getAttributeOrRefTypeSpecBounds(type, attrName) {
    const typeSpec = this.metamodel[type] || {};
    let str= typeSpec[attrName];
    let result= str[0].split(" ");
    let bounds= result[1].substr(1,result[1].length-2).split("..");
    return bounds;
  }

  attrOrRefExists(type, attrName) {
    if (this._isAlwaysValidFeature(type, attrName)) return true;
    return this._getAttributeOrRefTypeSpec(type, attrName) !== undefined;
  }

  attrOrRefHasType(type, attrName, attrOrRefType) {
    if (this._isAlwaysValidFeature(type, attrName)) return true;
    const attrOrRefSpec = this._getAttributeOrRefTypeSpec(type, attrName) || [];
    return attrOrRefSpec.includes(attrOrRefType);
  }
}

class TransformationValidator extends Validator {
  constructor(metamodel, transformation) {
    super(metamodel, 'transformation');
    this.transformation = transformation;
  }

  decompositionExists(type, name) {
    const decomp = this.transformation.getDecompositionBySignature(`${type}.${name}`);
    return !!decomp;
  }

  get errors() {
    const res = [];

    for (const decomposition of this.transformation.decompositions) {
      if (!this.typeExists(decomposition.function.type)) {
        res.push(this.makeError(decomposition.function.qualifiedName, `Decomposition Type ${decomposition.function.type} not found in metamodel`, decomposition.function.typeLocation));
      }

      for (const link of decomposition.links) {
        if (link.kind == 'forward') {
          if (!this.attrOrRefExists(decomposition.function.type, link.referenceName)) {
            res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `Reference ${link.referenceName} not found in type ${decomposition.function.type}`, link.referenceLocation));
          } else {
            if (!this.attrOrRefHasType(decomposition.function.type, link.referenceName, link.function.type) && link.function.type !== 'Object') {
              res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `Reference Type ${link.function.type} not allowed for reference ${decomposition.function.type}.${link.referenceName}`, link.function.typeLocation));
            }
          }

          if (!this.typeExists(link.function.type)) {
            res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `Forward Link Type ${link.function.type} not found in metamodel`, link.function.typeLocation));
          } else {
            if (link.function.isAbstract) { // eg. Foo.bar: cont -> Object.f
              const decompFunction = link.function.name;

              if (decompFunction !== 'center') {
                const possibleTypes = (this.metamodel[decomposition.function.type] || {})[link.referenceName] || [];
                for (const possibleType of possibleTypes) {
                  const targetDecomp = this.transformation.getDecompositionBySignature(`${possibleType}.${decompFunction}`);
                  if (targetDecomp == null) {
                    res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `No decomposition "${decompFunction}" found for concrete type ${possibleType}`, link.function.typeLocation));
                  }
                }
              }
            } else {
              if (!this.attrOrRefExists(link.function.type, link.function.name) && !this.decompositionExists(link.function.type, link.function.name)) {
                res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `No attribute, reference or decomposition found for link target ${link.function.qualifiedName}`, link.function.location));
              }
            }
          }

        } else if (link.kind == 'reverse') {
          if (!this.attrOrRefExists(link.function.type, link.referenceName)) {
            res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} <- ${link.function.qualifiedName}`, `Reference ${link.referenceName} not found in type ${link.function.type}`, link.referenceLocation));
          } else {
            if (!this.attrOrRefHasType(link.function.type, link.referenceName, decomposition.function.type)) {
              res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} <- ${link.function.qualifiedName}`, `Reference Type ${decomposition.function.type} not allowed for reference ${link.function.type}.${link.referenceName}`, link.function.typeLocation));
            }
          }

          if (!this.typeExists(link.function.type)) {
            res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} <- ${link.function.qualifiedName}`, `Reverse Link Type ${link.function.type} not found in metamodel`, link.function.typeLocation));
          } else {
            if (link.function.isAbstract) { // eg. Foo.bar: ref <- Object.f
              const decompFunction = link.function.name;

              if (decompFunction !== 'center') {
                for (const mmType of Object.keys(this.metamodel)) {
                  const typeDef = this.metamodel[mmType];
                  if (typeDef != null) {
                    const refTypes = typeDef[link.referenceName];
                    if (refTypes != undefined && refTypes.includes(decomposition.function.type)) {
                      const targetDecomp = this.transformation.getDecompositionBySignature(`${mmType}.${decompFunction}`);
                      if (targetDecomp == null) {
                        res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `No decomposition "${decompFunction}" found for concrete type ${mmType}`, link.function.typeLocation));
                      }
                    }
                  }
                }
              }
            } else {
              if (!this.attrOrRefExists(link.function.type, link.function.name) && !this.decompositionExists(link.function.type, link.function.name)) {
                res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.referenceName} -> ${link.function.qualifiedName}`, `No attribute, reference or decomposition found for link target ${link.function.qualifiedName}`, link.function.location));
              }
            }
          }
        } else if (link.kind == 'local') {
          // Either has decomposition or attribute
          const hasAttrOrRef = this.attrOrRefExists(link.decomposition.function.type, link.function.name);
          const hasDecomposition = this.transformation.getDecompositionBySignature(link.decomposition.function.type + '.' + link.function.name) != null;
          if (!hasAttrOrRef && !hasDecomposition) {
            res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.function.name}`, `No attribute or decomposition with name "${link.function.name}" found`, link.location));
          }
        } else if (link.kind == 'global') {
          if (link.function.type === 'Object') {
            // TODO what to check? If all decompositions in the transformation have a corresponding attribute or decomposition?
          } else {
            if (!this.typeExists(link.function.type)) {
              res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.function.qualifiedName}`, `Global Link Type ${link.function.type} not found in metamodel`, link.function.typeLocation));
            } else {
              const hasAttrOrRef = this.attrOrRefExists(link.function.type, link.function.name);
              const hasDecomposition = this.transformation.getDecompositionBySignature(link.function.type + '.' + link.function.name) != null;

              if (!hasAttrOrRef && !hasDecomposition) {
                res.push(this.makeError(`${decomposition.function.qualifiedName}: ${link.function.qualifiedName}`, `No attribute or decomposition with name "${link.function.name}" found`, link.function.location));
              }
            }
          }
        }
      }
    }

    return res;
  }
}

class DataValidator extends Validator {

  constructor(metamodel, centeredModel) {
    super(metamodel, 'input');
    this.centeredModel = centeredModel;
  }

  get errors() {
    const res = [];

    const visited = new Set();
    const open = [this.centeredModel.center];
    while (open.length > 0) {
      const obj = open.pop();

      if (visited.has(obj.id)) {
        continue;
      }
      visited.add(obj.id);

      if (!this.typeExists(obj.type)) {
        res.push(this.makeError(`Object of type ${obj.type}`, `Type ${obj.type} not found in metamodel`, obj.typeLocation));
        continue;
      }

      if (obj.isScalar) {
        let allowedTypes = this.metamodel[obj.type];
        if (allowedTypes === null) {
          allowedTypes = [null];
        }
        allowedTypes = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
        const scalarType = obj.scalarType;
        if (!allowedTypes.includes(scalarType)) {
          res.push(this.makeError(`Object of type ${obj.type}`, `${obj.type} value has disallowed type ${scalarType}`, obj.scalarValueLocation));
        }
      } else {
        for (const featureName of obj.featureNames) {
          if(this._getAttributeOrRefTypeSpecBounds(obj.type, featureName)[0]> obj.getFeatureAsArray(featureName).length){
            res.push(this.makeError(`Object of type ${obj.type}`, `Attribute or reference ${featureName} out of bounds Min: ${this._getAttributeOrRefTypeSpecBounds(obj.type, featureName)[0]}`, obj.getFeatureNameLocation(featureName)));
          }
          if(this._getAttributeOrRefTypeSpecBounds(obj.type, featureName)[1]< obj.getFeatureAsArray(featureName).length){
            res.push(this.makeError(`Object of type ${obj.type}`, `Attribute or reference ${featureName} out of bounds Max: ${this._getAttributeOrRefTypeSpecBounds(obj.type, featureName)[1]}`, obj.getFeatureNameLocation(featureName)));
          }
          if (!this.attrOrRefExists(obj.type, featureName)) {
            res.push(this.makeError(`Object of type ${obj.type}`, `Attribute or reference ${featureName} not found in type ${obj.type} in metamodel`, obj.getFeatureNameLocation(featureName)));
          } else {
            if (Array.isArray(obj.getAttributeType(featureName))) {
              const valueType = obj.getAttributeType(featureName);
              // Attribute sequence
              const attrOrRefSpec = this._getAttributeOrRefTypeSpec(obj.type, featureName);
              const allowedTypesInSeq = new Set(attrOrRefSpec.map(s => s.seq).flat());
              const disallowedTypes = Array.from(new Set([...valueType].filter(x => !allowedTypesInSeq.has(x)))); // set difference
              if (disallowedTypes.length > 0) {
                res.push(this.makeError(`Object of type ${obj.type}`, `Attribute sequence ${featureName} contains disallowed type(s): ${disallowedTypes.join(', ')}`, obj.getFeatureValueLocation(featureName)));
              }
            } else {
              // Attribute or reference
              for (const value of obj.getFeatureAsArray(featureName)) {

                let valueType = null;
                let markerLocation = null;
                if (value instanceof ObjectModel) {
                  // object
                  valueType = value.type;
                  markerLocation = value.typeLocation;
                } else {
                  // scalar
                  valueType = obj.getAttributeType(featureName);
                  markerLocation = obj.getFeatureValueLocation(featureName);
                }

                if (!this.attrOrRefHasType(obj.type, featureName, valueType)) {
                  res.push(this.makeError(`Object of type ${obj.type}`, `Attribute or reference ${featureName} has disallowed type ${valueType}`, markerLocation));
                }

                if (value instanceof ObjectModel) {
                  open.push(value);
                }
              }
            }
          }
        }
      }
    }

    return res;
  }
}

module.exports = {
  MetamodelInferer: MetamodelInferer,
  TransformationValidator: TransformationValidator,
  DataValidator: DataValidator
};

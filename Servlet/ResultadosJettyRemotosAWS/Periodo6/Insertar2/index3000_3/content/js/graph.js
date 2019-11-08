/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 1098.0, "minX": 0.0, "maxY": 25962.0, "series": [{"data": [[0.0, 1098.0], [0.1, 1855.0], [0.2, 2374.0], [0.3, 2528.0], [0.4, 2685.0], [0.5, 2708.0], [0.6, 2744.0], [0.7, 2787.0], [0.8, 2817.0], [0.9, 2927.0], [1.0, 2981.0], [1.1, 3006.0], [1.2, 3026.0], [1.3, 3036.0], [1.4, 3096.0], [1.5, 3108.0], [1.6, 3134.0], [1.7, 3163.0], [1.8, 3209.0], [1.9, 3263.0], [2.0, 3317.0], [2.1, 3340.0], [2.2, 3364.0], [2.3, 3398.0], [2.4, 3477.0], [2.5, 3494.0], [2.6, 3515.0], [2.7, 3551.0], [2.8, 3575.0], [2.9, 3617.0], [3.0, 3643.0], [3.1, 3690.0], [3.2, 3706.0], [3.3, 3740.0], [3.4, 3783.0], [3.5, 3790.0], [3.6, 3815.0], [3.7, 3823.0], [3.8, 3839.0], [3.9, 3861.0], [4.0, 3870.0], [4.1, 3895.0], [4.2, 3915.0], [4.3, 3921.0], [4.4, 3943.0], [4.5, 3945.0], [4.6, 3951.0], [4.7, 3962.0], [4.8, 3968.0], [4.9, 3981.0], [5.0, 3997.0], [5.1, 4012.0], [5.2, 4018.0], [5.3, 4049.0], [5.4, 4057.0], [5.5, 4063.0], [5.6, 4090.0], [5.7, 4116.0], [5.8, 4120.0], [5.9, 4132.0], [6.0, 4155.0], [6.1, 4174.0], [6.2, 4181.0], [6.3, 4198.0], [6.4, 4210.0], [6.5, 4218.0], [6.6, 4248.0], [6.7, 4257.0], [6.8, 4278.0], [6.9, 4295.0], [7.0, 4307.0], [7.1, 4332.0], [7.2, 4353.0], [7.3, 4360.0], [7.4, 4368.0], [7.5, 4374.0], [7.6, 4404.0], [7.7, 4420.0], [7.8, 4426.0], [7.9, 4453.0], [8.0, 4463.0], [8.1, 4479.0], [8.2, 4533.0], [8.3, 4548.0], [8.4, 4569.0], [8.5, 4594.0], [8.6, 4609.0], [8.7, 4642.0], [8.8, 4661.0], [8.9, 4679.0], [9.0, 4688.0], [9.1, 4710.0], [9.2, 4742.0], [9.3, 4762.0], [9.4, 4787.0], [9.5, 4802.0], [9.6, 4810.0], [9.7, 4823.0], [9.8, 4828.0], [9.9, 4843.0], [10.0, 4860.0], [10.1, 4878.0], [10.2, 4921.0], [10.3, 4927.0], [10.4, 4949.0], [10.5, 4973.0], [10.6, 5015.0], [10.7, 5116.0], [10.8, 5135.0], [10.9, 5185.0], [11.0, 5230.0], [11.1, 5263.0], [11.2, 5280.0], [11.3, 5319.0], [11.4, 5371.0], [11.5, 5408.0], [11.6, 5433.0], [11.7, 5461.0], [11.8, 5489.0], [11.9, 5510.0], [12.0, 5520.0], [12.1, 5540.0], [12.2, 5557.0], [12.3, 5578.0], [12.4, 5583.0], [12.5, 5592.0], [12.6, 5610.0], [12.7, 5619.0], [12.8, 5626.0], [12.9, 5639.0], [13.0, 5648.0], [13.1, 5651.0], [13.2, 5659.0], [13.3, 5676.0], [13.4, 5695.0], [13.5, 5709.0], [13.6, 5728.0], [13.7, 5765.0], [13.8, 5785.0], [13.9, 5816.0], [14.0, 5831.0], [14.1, 5859.0], [14.2, 5862.0], [14.3, 5896.0], [14.4, 5914.0], [14.5, 5920.0], [14.6, 5939.0], [14.7, 5956.0], [14.8, 5977.0], [14.9, 5985.0], [15.0, 6027.0], [15.1, 6075.0], [15.2, 6132.0], [15.3, 6190.0], [15.4, 6244.0], [15.5, 6328.0], [15.6, 6338.0], [15.7, 6351.0], [15.8, 6411.0], [15.9, 6443.0], [16.0, 6458.0], [16.1, 6481.0], [16.2, 6490.0], [16.3, 6501.0], [16.4, 6541.0], [16.5, 6577.0], [16.6, 6581.0], [16.7, 6610.0], [16.8, 6645.0], [16.9, 6670.0], [17.0, 6707.0], [17.1, 6713.0], [17.2, 6726.0], [17.3, 6730.0], [17.4, 6766.0], [17.5, 6777.0], [17.6, 6795.0], [17.7, 6818.0], [17.8, 6832.0], [17.9, 6837.0], [18.0, 6867.0], [18.1, 6889.0], [18.2, 6945.0], [18.3, 6991.0], [18.4, 7015.0], [18.5, 7036.0], [18.6, 7069.0], [18.7, 7080.0], [18.8, 7138.0], [18.9, 7151.0], [19.0, 7161.0], [19.1, 7184.0], [19.2, 7221.0], [19.3, 7257.0], [19.4, 7288.0], [19.5, 7375.0], [19.6, 7404.0], [19.7, 7423.0], [19.8, 7465.0], [19.9, 7501.0], [20.0, 7518.0], [20.1, 7553.0], [20.2, 7580.0], [20.3, 7621.0], [20.4, 7682.0], [20.5, 7722.0], [20.6, 7738.0], [20.7, 7765.0], [20.8, 7796.0], [20.9, 7827.0], [21.0, 7841.0], [21.1, 7860.0], [21.2, 7924.0], [21.3, 7933.0], [21.4, 7962.0], [21.5, 7980.0], [21.6, 8012.0], [21.7, 8029.0], [21.8, 8057.0], [21.9, 8070.0], [22.0, 8075.0], [22.1, 8087.0], [22.2, 8112.0], [22.3, 8127.0], [22.4, 8139.0], [22.5, 8156.0], [22.6, 8164.0], [22.7, 8178.0], [22.8, 8182.0], [22.9, 8238.0], [23.0, 8265.0], [23.1, 8281.0], [23.2, 8320.0], [23.3, 8353.0], [23.4, 8364.0], [23.5, 8392.0], [23.6, 8408.0], [23.7, 8471.0], [23.8, 8522.0], [23.9, 8550.0], [24.0, 8587.0], [24.1, 8606.0], [24.2, 8622.0], [24.3, 8631.0], [24.4, 8664.0], [24.5, 8685.0], [24.6, 8692.0], [24.7, 8723.0], [24.8, 8741.0], [24.9, 8765.0], [25.0, 8774.0], [25.1, 8802.0], [25.2, 8822.0], [25.3, 8831.0], [25.4, 8854.0], [25.5, 8864.0], [25.6, 8890.0], [25.7, 8918.0], [25.8, 8930.0], [25.9, 8945.0], [26.0, 8959.0], [26.1, 8971.0], [26.2, 8985.0], [26.3, 8989.0], [26.4, 8998.0], [26.5, 9007.0], [26.6, 9025.0], [26.7, 9030.0], [26.8, 9041.0], [26.9, 9060.0], [27.0, 9075.0], [27.1, 9081.0], [27.2, 9097.0], [27.3, 9109.0], [27.4, 9122.0], [27.5, 9163.0], [27.6, 9182.0], [27.7, 9212.0], [27.8, 9222.0], [27.9, 9249.0], [28.0, 9287.0], [28.1, 9312.0], [28.2, 9322.0], [28.3, 9335.0], [28.4, 9346.0], [28.5, 9363.0], [28.6, 9384.0], [28.7, 9387.0], [28.8, 9417.0], [28.9, 9429.0], [29.0, 9441.0], [29.1, 9450.0], [29.2, 9465.0], [29.3, 9471.0], [29.4, 9485.0], [29.5, 9500.0], [29.6, 9532.0], [29.7, 9539.0], [29.8, 9544.0], [29.9, 9555.0], [30.0, 9566.0], [30.1, 9586.0], [30.2, 9618.0], [30.3, 9625.0], [30.4, 9634.0], [30.5, 9643.0], [30.6, 9650.0], [30.7, 9680.0], [30.8, 9691.0], [30.9, 9700.0], [31.0, 9734.0], [31.1, 9762.0], [31.2, 9778.0], [31.3, 9788.0], [31.4, 9800.0], [31.5, 9815.0], [31.6, 9827.0], [31.7, 9839.0], [31.8, 9888.0], [31.9, 9897.0], [32.0, 9900.0], [32.1, 9927.0], [32.2, 9937.0], [32.3, 9949.0], [32.4, 9958.0], [32.5, 9972.0], [32.6, 9998.0], [32.7, 10039.0], [32.8, 10052.0], [32.9, 10059.0], [33.0, 10085.0], [33.1, 10134.0], [33.2, 10155.0], [33.3, 10157.0], [33.4, 10173.0], [33.5, 10198.0], [33.6, 10224.0], [33.7, 10256.0], [33.8, 10287.0], [33.9, 10325.0], [34.0, 10342.0], [34.1, 10362.0], [34.2, 10381.0], [34.3, 10408.0], [34.4, 10428.0], [34.5, 10452.0], [34.6, 10462.0], [34.7, 10482.0], [34.8, 10500.0], [34.9, 10529.0], [35.0, 10538.0], [35.1, 10557.0], [35.2, 10569.0], [35.3, 10576.0], [35.4, 10603.0], [35.5, 10624.0], [35.6, 10633.0], [35.7, 10645.0], [35.8, 10665.0], [35.9, 10692.0], [36.0, 10730.0], [36.1, 10789.0], [36.2, 10825.0], [36.3, 10844.0], [36.4, 10865.0], [36.5, 10867.0], [36.6, 10884.0], [36.7, 10896.0], [36.8, 10911.0], [36.9, 10952.0], [37.0, 10976.0], [37.1, 10999.0], [37.2, 11014.0], [37.3, 11031.0], [37.4, 11060.0], [37.5, 11119.0], [37.6, 11134.0], [37.7, 11163.0], [37.8, 11186.0], [37.9, 11229.0], [38.0, 11240.0], [38.1, 11258.0], [38.2, 11284.0], [38.3, 11328.0], [38.4, 11359.0], [38.5, 11378.0], [38.6, 11398.0], [38.7, 11412.0], [38.8, 11437.0], [38.9, 11494.0], [39.0, 11502.0], [39.1, 11518.0], [39.2, 11592.0], [39.3, 11606.0], [39.4, 11618.0], [39.5, 11638.0], [39.6, 11658.0], [39.7, 11678.0], [39.8, 11691.0], [39.9, 11720.0], [40.0, 11736.0], [40.1, 11762.0], [40.2, 11792.0], [40.3, 11807.0], [40.4, 11830.0], [40.5, 11871.0], [40.6, 11901.0], [40.7, 11945.0], [40.8, 11964.0], [40.9, 11996.0], [41.0, 12010.0], [41.1, 12036.0], [41.2, 12066.0], [41.3, 12101.0], [41.4, 12136.0], [41.5, 12147.0], [41.6, 12160.0], [41.7, 12176.0], [41.8, 12190.0], [41.9, 12207.0], [42.0, 12228.0], [42.1, 12239.0], [42.2, 12257.0], [42.3, 12276.0], [42.4, 12298.0], [42.5, 12308.0], [42.6, 12313.0], [42.7, 12341.0], [42.8, 12364.0], [42.9, 12378.0], [43.0, 12395.0], [43.1, 12410.0], [43.2, 12427.0], [43.3, 12456.0], [43.4, 12467.0], [43.5, 12499.0], [43.6, 12528.0], [43.7, 12592.0], [43.8, 12600.0], [43.9, 12645.0], [44.0, 12650.0], [44.1, 12670.0], [44.2, 12688.0], [44.3, 12728.0], [44.4, 12750.0], [44.5, 12794.0], [44.6, 12809.0], [44.7, 12820.0], [44.8, 12832.0], [44.9, 12846.0], [45.0, 12927.0], [45.1, 12948.0], [45.2, 12970.0], [45.3, 12990.0], [45.4, 13028.0], [45.5, 13041.0], [45.6, 13067.0], [45.7, 13082.0], [45.8, 13090.0], [45.9, 13102.0], [46.0, 13134.0], [46.1, 13147.0], [46.2, 13196.0], [46.3, 13230.0], [46.4, 13269.0], [46.5, 13289.0], [46.6, 13297.0], [46.7, 13323.0], [46.8, 13341.0], [46.9, 13380.0], [47.0, 13451.0], [47.1, 13482.0], [47.2, 13515.0], [47.3, 13527.0], [47.4, 13612.0], [47.5, 13694.0], [47.6, 13709.0], [47.7, 13741.0], [47.8, 13759.0], [47.9, 13776.0], [48.0, 13818.0], [48.1, 13867.0], [48.2, 13880.0], [48.3, 13898.0], [48.4, 13912.0], [48.5, 13980.0], [48.6, 13991.0], [48.7, 14032.0], [48.8, 14107.0], [48.9, 14133.0], [49.0, 14198.0], [49.1, 14243.0], [49.2, 14327.0], [49.3, 14416.0], [49.4, 14475.0], [49.5, 14526.0], [49.6, 14615.0], [49.7, 14643.0], [49.8, 14681.0], [49.9, 14722.0], [50.0, 14769.0], [50.1, 14796.0], [50.2, 14805.0], [50.3, 14831.0], [50.4, 14840.0], [50.5, 14850.0], [50.6, 14888.0], [50.7, 14919.0], [50.8, 14932.0], [50.9, 14948.0], [51.0, 14958.0], [51.1, 14965.0], [51.2, 14971.0], [51.3, 15000.0], [51.4, 15030.0], [51.5, 15054.0], [51.6, 15091.0], [51.7, 15158.0], [51.8, 15183.0], [51.9, 15214.0], [52.0, 15256.0], [52.1, 15276.0], [52.2, 15288.0], [52.3, 15333.0], [52.4, 15373.0], [52.5, 15455.0], [52.6, 15486.0], [52.7, 15511.0], [52.8, 15551.0], [52.9, 15579.0], [53.0, 15589.0], [53.1, 15621.0], [53.2, 15638.0], [53.3, 15665.0], [53.4, 15725.0], [53.5, 15761.0], [53.6, 15800.0], [53.7, 15821.0], [53.8, 15866.0], [53.9, 15886.0], [54.0, 15922.0], [54.1, 15969.0], [54.2, 15995.0], [54.3, 16036.0], [54.4, 16076.0], [54.5, 16089.0], [54.6, 16118.0], [54.7, 16135.0], [54.8, 16144.0], [54.9, 16163.0], [55.0, 16182.0], [55.1, 16203.0], [55.2, 16258.0], [55.3, 16287.0], [55.4, 16344.0], [55.5, 16374.0], [55.6, 16388.0], [55.7, 16428.0], [55.8, 16455.0], [55.9, 16483.0], [56.0, 16531.0], [56.1, 16578.0], [56.2, 16641.0], [56.3, 16668.0], [56.4, 16719.0], [56.5, 16744.0], [56.6, 16752.0], [56.7, 16764.0], [56.8, 16800.0], [56.9, 16822.0], [57.0, 16835.0], [57.1, 16894.0], [57.2, 16918.0], [57.3, 16943.0], [57.4, 16966.0], [57.5, 17019.0], [57.6, 17079.0], [57.7, 17123.0], [57.8, 17136.0], [57.9, 17160.0], [58.0, 17179.0], [58.1, 17182.0], [58.2, 17215.0], [58.3, 17267.0], [58.4, 17275.0], [58.5, 17308.0], [58.6, 17343.0], [58.7, 17456.0], [58.8, 17476.0], [58.9, 17531.0], [59.0, 17567.0], [59.1, 17584.0], [59.2, 17594.0], [59.3, 17683.0], [59.4, 17705.0], [59.5, 17740.0], [59.6, 17745.0], [59.7, 17780.0], [59.8, 17839.0], [59.9, 17854.0], [60.0, 17886.0], [60.1, 17931.0], [60.2, 17952.0], [60.3, 17971.0], [60.4, 17980.0], [60.5, 17994.0], [60.6, 18026.0], [60.7, 18034.0], [60.8, 18046.0], [60.9, 18062.0], [61.0, 18081.0], [61.1, 18098.0], [61.2, 18104.0], [61.3, 18133.0], [61.4, 18151.0], [61.5, 18176.0], [61.6, 18233.0], [61.7, 18245.0], [61.8, 18273.0], [61.9, 18297.0], [62.0, 18344.0], [62.1, 18376.0], [62.2, 18406.0], [62.3, 18441.0], [62.4, 18493.0], [62.5, 18519.0], [62.6, 18525.0], [62.7, 18577.0], [62.8, 18595.0], [62.9, 18609.0], [63.0, 18621.0], [63.1, 18639.0], [63.2, 18651.0], [63.3, 18658.0], [63.4, 18668.0], [63.5, 18683.0], [63.6, 18703.0], [63.7, 18761.0], [63.8, 18815.0], [63.9, 18836.0], [64.0, 18856.0], [64.1, 18891.0], [64.2, 18911.0], [64.3, 18924.0], [64.4, 18939.0], [64.5, 18991.0], [64.6, 19004.0], [64.7, 19035.0], [64.8, 19060.0], [64.9, 19082.0], [65.0, 19096.0], [65.1, 19115.0], [65.2, 19118.0], [65.3, 19128.0], [65.4, 19183.0], [65.5, 19197.0], [65.6, 19247.0], [65.7, 19280.0], [65.8, 19301.0], [65.9, 19323.0], [66.0, 19330.0], [66.1, 19351.0], [66.2, 19421.0], [66.3, 19464.0], [66.4, 19480.0], [66.5, 19498.0], [66.6, 19549.0], [66.7, 19581.0], [66.8, 19600.0], [66.9, 19665.0], [67.0, 19680.0], [67.1, 19688.0], [67.2, 19707.0], [67.3, 19742.0], [67.4, 19775.0], [67.5, 19778.0], [67.6, 19813.0], [67.7, 19826.0], [67.8, 19838.0], [67.9, 19857.0], [68.0, 19872.0], [68.1, 19887.0], [68.2, 19915.0], [68.3, 19924.0], [68.4, 19942.0], [68.5, 19949.0], [68.6, 19976.0], [68.7, 19980.0], [68.8, 19991.0], [68.9, 20009.0], [69.0, 20040.0], [69.1, 20089.0], [69.2, 20116.0], [69.3, 20142.0], [69.4, 20158.0], [69.5, 20179.0], [69.6, 20192.0], [69.7, 20199.0], [69.8, 20202.0], [69.9, 20224.0], [70.0, 20256.0], [70.1, 20274.0], [70.2, 20298.0], [70.3, 20315.0], [70.4, 20327.0], [70.5, 20354.0], [70.6, 20380.0], [70.7, 20402.0], [70.8, 20436.0], [70.9, 20452.0], [71.0, 20483.0], [71.1, 20497.0], [71.2, 20525.0], [71.3, 20538.0], [71.4, 20577.0], [71.5, 20583.0], [71.6, 20619.0], [71.7, 20629.0], [71.8, 20634.0], [71.9, 20662.0], [72.0, 20667.0], [72.1, 20699.0], [72.2, 20715.0], [72.3, 20738.0], [72.4, 20756.0], [72.5, 20775.0], [72.6, 20794.0], [72.7, 20810.0], [72.8, 20822.0], [72.9, 20829.0], [73.0, 20833.0], [73.1, 20846.0], [73.2, 20880.0], [73.3, 20889.0], [73.4, 20907.0], [73.5, 20914.0], [73.6, 20919.0], [73.7, 20945.0], [73.8, 20957.0], [73.9, 20972.0], [74.0, 20978.0], [74.1, 21002.0], [74.2, 21027.0], [74.3, 21060.0], [74.4, 21070.0], [74.5, 21088.0], [74.6, 21107.0], [74.7, 21111.0], [74.8, 21116.0], [74.9, 21135.0], [75.0, 21151.0], [75.1, 21175.0], [75.2, 21227.0], [75.3, 21239.0], [75.4, 21252.0], [75.5, 21260.0], [75.6, 21270.0], [75.7, 21283.0], [75.8, 21292.0], [75.9, 21314.0], [76.0, 21326.0], [76.1, 21371.0], [76.2, 21378.0], [76.3, 21398.0], [76.4, 21426.0], [76.5, 21447.0], [76.6, 21456.0], [76.7, 21510.0], [76.8, 21543.0], [76.9, 21554.0], [77.0, 21570.0], [77.1, 21577.0], [77.2, 21607.0], [77.3, 21623.0], [77.4, 21647.0], [77.5, 21652.0], [77.6, 21670.0], [77.7, 21686.0], [77.8, 21707.0], [77.9, 21734.0], [78.0, 21753.0], [78.1, 21774.0], [78.2, 21791.0], [78.3, 21812.0], [78.4, 21816.0], [78.5, 21833.0], [78.6, 21863.0], [78.7, 21870.0], [78.8, 21874.0], [78.9, 21883.0], [79.0, 21908.0], [79.1, 21952.0], [79.2, 21967.0], [79.3, 21988.0], [79.4, 22007.0], [79.5, 22021.0], [79.6, 22044.0], [79.7, 22067.0], [79.8, 22075.0], [79.9, 22096.0], [80.0, 22119.0], [80.1, 22135.0], [80.2, 22160.0], [80.3, 22165.0], [80.4, 22201.0], [80.5, 22223.0], [80.6, 22259.0], [80.7, 22271.0], [80.8, 22301.0], [80.9, 22312.0], [81.0, 22326.0], [81.1, 22354.0], [81.2, 22361.0], [81.3, 22387.0], [81.4, 22424.0], [81.5, 22434.0], [81.6, 22460.0], [81.7, 22481.0], [81.8, 22499.0], [81.9, 22521.0], [82.0, 22560.0], [82.1, 22576.0], [82.2, 22588.0], [82.3, 22619.0], [82.4, 22623.0], [82.5, 22654.0], [82.6, 22670.0], [82.7, 22681.0], [82.8, 22701.0], [82.9, 22742.0], [83.0, 22763.0], [83.1, 22778.0], [83.2, 22800.0], [83.3, 22828.0], [83.4, 22841.0], [83.5, 22842.0], [83.6, 22856.0], [83.7, 22862.0], [83.8, 22876.0], [83.9, 22900.0], [84.0, 22914.0], [84.1, 22948.0], [84.2, 22973.0], [84.3, 22996.0], [84.4, 23021.0], [84.5, 23038.0], [84.6, 23052.0], [84.7, 23087.0], [84.8, 23120.0], [84.9, 23135.0], [85.0, 23145.0], [85.1, 23158.0], [85.2, 23167.0], [85.3, 23192.0], [85.4, 23211.0], [85.5, 23241.0], [85.6, 23280.0], [85.7, 23295.0], [85.8, 23311.0], [85.9, 23341.0], [86.0, 23394.0], [86.1, 23427.0], [86.2, 23436.0], [86.3, 23452.0], [86.4, 23472.0], [86.5, 23502.0], [86.6, 23520.0], [86.7, 23533.0], [86.8, 23548.0], [86.9, 23562.0], [87.0, 23604.0], [87.1, 23630.0], [87.2, 23678.0], [87.3, 23697.0], [87.4, 23726.0], [87.5, 23753.0], [87.6, 23772.0], [87.7, 23794.0], [87.8, 23801.0], [87.9, 23830.0], [88.0, 23842.0], [88.1, 23863.0], [88.2, 23910.0], [88.3, 23939.0], [88.4, 23943.0], [88.5, 23967.0], [88.6, 23989.0], [88.7, 24033.0], [88.8, 24041.0], [88.9, 24064.0], [89.0, 24068.0], [89.1, 24094.0], [89.2, 24113.0], [89.3, 24135.0], [89.4, 24182.0], [89.5, 24216.0], [89.6, 24234.0], [89.7, 24292.0], [89.8, 24320.0], [89.9, 24368.0], [90.0, 24457.0], [90.1, 24474.0], [90.2, 24492.0], [90.3, 24501.0], [90.4, 24536.0], [90.5, 24550.0], [90.6, 24569.0], [90.7, 24604.0], [90.8, 24619.0], [90.9, 24640.0], [91.0, 24662.0], [91.1, 24692.0], [91.2, 24702.0], [91.3, 24706.0], [91.4, 24725.0], [91.5, 24759.0], [91.6, 24771.0], [91.7, 24783.0], [91.8, 24803.0], [91.9, 24817.0], [92.0, 24840.0], [92.1, 24845.0], [92.2, 24848.0], [92.3, 24864.0], [92.4, 24875.0], [92.5, 24878.0], [92.6, 24884.0], [92.7, 24892.0], [92.8, 24896.0], [92.9, 24906.0], [93.0, 24914.0], [93.1, 24919.0], [93.2, 24936.0], [93.3, 24947.0], [93.4, 24956.0], [93.5, 24966.0], [93.6, 24971.0], [93.7, 24973.0], [93.8, 24987.0], [93.9, 24990.0], [94.0, 24993.0], [94.1, 24996.0], [94.2, 24999.0], [94.3, 25002.0], [94.4, 25004.0], [94.5, 25009.0], [94.6, 25012.0], [94.7, 25017.0], [94.8, 25031.0], [94.9, 25037.0], [95.0, 25040.0], [95.1, 25042.0], [95.2, 25044.0], [95.3, 25047.0], [95.4, 25050.0], [95.5, 25054.0], [95.6, 25061.0], [95.7, 25064.0], [95.8, 25066.0], [95.9, 25069.0], [96.0, 25076.0], [96.1, 25082.0], [96.2, 25085.0], [96.3, 25100.0], [96.4, 25104.0], [96.5, 25111.0], [96.6, 25114.0], [96.7, 25117.0], [96.8, 25127.0], [96.9, 25135.0], [97.0, 25139.0], [97.1, 25154.0], [97.2, 25157.0], [97.3, 25161.0], [97.4, 25164.0], [97.5, 25169.0], [97.6, 25179.0], [97.7, 25180.0], [97.8, 25193.0], [97.9, 25199.0], [98.0, 25213.0], [98.1, 25216.0], [98.2, 25232.0], [98.3, 25252.0], [98.4, 25264.0], [98.5, 25289.0], [98.6, 25310.0], [98.7, 25317.0], [98.8, 25329.0], [98.9, 25339.0], [99.0, 25368.0], [99.1, 25406.0], [99.2, 25414.0], [99.3, 25424.0], [99.4, 25447.0], [99.5, 25455.0], [99.6, 25551.0], [99.7, 25686.0], [99.8, 25755.0], [99.9, 25885.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 1000.0, "maxY": 62.0, "series": [{"data": [[1000.0, 1.0], [1600.0, 1.0], [1700.0, 1.0], [1800.0, 1.0], [2000.0, 1.0], [2200.0, 1.0], [2300.0, 1.0], [2400.0, 2.0], [2500.0, 1.0], [2600.0, 4.0], [2700.0, 9.0], [2800.0, 3.0], [2900.0, 7.0], [3000.0, 9.0], [3100.0, 10.0], [3200.0, 7.0], [3300.0, 10.0], [3400.0, 6.0], [3500.0, 12.0], [3600.0, 8.0], [3700.0, 12.0], [3800.0, 19.0], [3900.0, 25.0], [4000.0, 18.0], [4100.0, 22.0], [4200.0, 18.0], [4300.0, 18.0], [4400.0, 18.0], [4600.0, 16.0], [4500.0, 11.0], [4800.0, 21.0], [4700.0, 13.0], [4900.0, 12.0], [5000.0, 3.0], [5100.0, 7.0], [5200.0, 10.0], [5300.0, 6.0], [5400.0, 11.0], [5500.0, 21.0], [5600.0, 27.0], [5700.0, 14.0], [5800.0, 13.0], [5900.0, 19.0], [6000.0, 6.0], [6100.0, 5.0], [6300.0, 11.0], [6200.0, 3.0], [6500.0, 11.0], [6400.0, 15.0], [6600.0, 9.0], [6700.0, 19.0], [6800.0, 15.0], [6900.0, 7.0], [7100.0, 11.0], [7000.0, 12.0], [7200.0, 9.0], [7400.0, 9.0], [7300.0, 5.0], [7600.0, 6.0], [7500.0, 10.0], [7700.0, 12.0], [7800.0, 10.0], [7900.0, 12.0], [8000.0, 17.0], [8100.0, 21.0], [8200.0, 9.0], [8300.0, 14.0], [8600.0, 16.0], [8500.0, 9.0], [8700.0, 13.0], [8400.0, 6.0], [8800.0, 18.0], [8900.0, 24.0], [9000.0, 23.0], [9100.0, 14.0], [9200.0, 11.0], [9300.0, 20.0], [9400.0, 23.0], [9500.0, 19.0], [9600.0, 23.0], [9700.0, 15.0], [9800.0, 18.0], [9900.0, 19.0], [10000.0, 14.0], [10100.0, 13.0], [10200.0, 10.0], [10300.0, 13.0], [10400.0, 15.0], [10500.0, 17.0], [10600.0, 17.0], [10700.0, 8.0], [10800.0, 16.0], [10900.0, 12.0], [11100.0, 11.0], [11200.0, 13.0], [11000.0, 10.0], [11300.0, 12.0], [11400.0, 9.0], [11600.0, 17.0], [11700.0, 13.0], [11500.0, 9.0], [12200.0, 17.0], [12100.0, 18.0], [12000.0, 11.0], [11900.0, 10.0], [11800.0, 10.0], [12300.0, 18.0], [12500.0, 7.0], [12600.0, 15.0], [12400.0, 14.0], [12700.0, 9.0], [13200.0, 12.0], [13300.0, 9.0], [13000.0, 16.0], [12800.0, 14.0], [13100.0, 11.0], [12900.0, 10.0], [13600.0, 4.0], [13400.0, 7.0], [13500.0, 7.0], [13700.0, 14.0], [13800.0, 10.0], [14100.0, 8.0], [14000.0, 4.0], [13900.0, 9.0], [14300.0, 3.0], [14200.0, 5.0], [14400.0, 4.0], [14600.0, 8.0], [14500.0, 5.0], [14800.0, 16.0], [14700.0, 8.0], [14900.0, 18.0], [15000.0, 11.0], [15100.0, 8.0], [15300.0, 6.0], [15200.0, 11.0], [15500.0, 13.0], [15800.0, 10.0], [15400.0, 6.0], [15600.0, 9.0], [15700.0, 6.0], [16000.0, 10.0], [16100.0, 16.0], [15900.0, 9.0], [16300.0, 9.0], [16200.0, 7.0], [16600.0, 7.0], [16400.0, 10.0], [16800.0, 10.0], [17000.0, 8.0], [17200.0, 9.0], [17400.0, 6.0], [18000.0, 19.0], [18200.0, 12.0], [18400.0, 7.0], [17800.0, 8.0], [17600.0, 4.0], [19200.0, 8.0], [18600.0, 23.0], [18800.0, 11.0], [19000.0, 16.0], [19400.0, 11.0], [19800.0, 18.0], [19600.0, 11.0], [20200.0, 14.0], [20400.0, 13.0], [20000.0, 7.0], [20600.0, 18.0], [20800.0, 21.0], [21000.0, 15.0], [21200.0, 22.0], [21400.0, 11.0], [21800.0, 21.0], [22200.0, 11.0], [21600.0, 17.0], [22000.0, 17.0], [22400.0, 14.0], [22800.0, 21.0], [23200.0, 10.0], [22600.0, 16.0], [23000.0, 12.0], [23400.0, 14.0], [23600.0, 10.0], [23800.0, 13.0], [24000.0, 16.0], [24200.0, 9.0], [24400.0, 10.0], [24800.0, 33.0], [24600.0, 13.0], [25000.0, 62.0], [25200.0, 20.0], [25400.0, 14.0], [25600.0, 2.0], [25800.0, 3.0], [16500.0, 6.0], [17100.0, 14.0], [16700.0, 12.0], [17300.0, 5.0], [16900.0, 9.0], [18300.0, 8.0], [17700.0, 12.0], [17900.0, 15.0], [18100.0, 11.0], [17500.0, 12.0], [18500.0, 12.0], [18700.0, 5.0], [18900.0, 13.0], [19300.0, 11.0], [19100.0, 13.0], [19700.0, 12.0], [19500.0, 8.0], [19900.0, 22.0], [20100.0, 19.0], [20300.0, 14.0], [20500.0, 12.0], [20700.0, 15.0], [20900.0, 23.0], [21100.0, 17.0], [21300.0, 13.0], [21500.0, 15.0], [22100.0, 13.0], [22300.0, 18.0], [21700.0, 14.0], [21900.0, 14.0], [22500.0, 12.0], [22900.0, 14.0], [23500.0, 15.0], [22700.0, 13.0], [23100.0, 19.0], [23300.0, 9.0], [23900.0, 13.0], [23700.0, 13.0], [24100.0, 8.0], [24300.0, 7.0], [24500.0, 12.0], [24700.0, 19.0], [25100.0, 49.0], [24900.0, 41.0], [25300.0, 15.0], [25500.0, 3.0], [25700.0, 4.0], [25900.0, 1.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 25900.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2999.0, "series": [{"data": [[1.0, 1.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[2.0, 2999.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 133.05283018867925, "minX": 1.54958328E12, "maxY": 1504.6877513711186, "series": [{"data": [[1.54958328E12, 1504.6877513711186], [1.54958334E12, 133.05283018867925]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 3622.6, "minX": 1.0, "maxY": 25962.0, "series": [{"data": [[2.0, 25196.0], [3.0, 25076.0], [4.0, 25193.0], [5.0, 25049.0], [6.0, 25085.0], [7.0, 25127.0], [8.0, 25166.0], [9.0, 25108.0], [10.0, 25034.0], [12.0, 25146.0], [13.0, 25052.0], [14.0, 25187.0], [16.0, 25160.5], [17.0, 25175.0], [18.0, 25048.0], [19.0, 25368.0], [20.0, 25161.0], [21.0, 25031.0], [22.0, 25165.0], [23.0, 25310.0], [24.0, 25011.0], [25.0, 25164.0], [26.0, 25043.0], [27.0, 25062.0], [28.0, 25389.0], [29.0, 25162.0], [30.0, 25072.0], [31.0, 25136.0], [32.0, 25084.0], [35.0, 25044.0], [34.0, 25157.0], [37.0, 25094.0], [36.0, 25047.0], [39.0, 25042.0], [38.0, 25149.0], [41.0, 25329.0], [40.0, 25120.0], [43.0, 25269.0], [45.0, 25003.0], [44.0, 25050.0], [47.0, 25743.0], [46.0, 25009.0], [49.0, 25337.0], [48.0, 24988.0], [51.0, 25282.5], [53.0, 25139.0], [52.0, 25017.0], [55.0, 25772.0], [54.0, 25138.0], [57.0, 24986.0], [56.0, 25066.0], [59.0, 25271.0], [58.0, 25448.0], [61.0, 25110.0], [60.0, 25103.0], [63.0, 25116.0], [62.0, 25015.0], [67.0, 25050.0], [66.0, 25104.0], [65.0, 24967.0], [64.0, 25040.0], [71.0, 25312.0], [70.0, 25455.0], [69.0, 25289.0], [68.0, 25246.0], [75.0, 25213.0], [74.0, 25890.0], [73.0, 25000.0], [72.0, 25298.0], [79.0, 25004.0], [78.0, 25423.0], [76.0, 25046.0], [83.0, 25252.0], [82.0, 25216.0], [81.0, 25114.5], [87.0, 25064.0], [86.0, 25000.0], [85.0, 25077.0], [84.0, 25198.0], [91.0, 25007.0], [90.0, 25046.0], [89.0, 25062.0], [88.0, 24989.0], [95.0, 25962.0], [94.0, 25054.0], [93.0, 25055.0], [92.0, 25064.0], [99.0, 25044.0], [98.0, 24919.0], [97.0, 25179.0], [96.0, 24966.0], [103.0, 25273.0], [102.0, 24964.0], [101.0, 25755.0], [100.0, 25040.0], [107.0, 25133.5], [105.0, 25025.0], [104.0, 25025.0], [111.0, 25420.0], [110.0, 24947.0], [109.0, 25180.0], [108.0, 24968.0], [115.0, 24771.0], [114.0, 25010.0], [113.0, 25012.0], [112.0, 25135.0], [119.0, 24956.0], [118.0, 25203.0], [117.0, 24926.5], [123.0, 24996.0], [122.0, 24892.0], [121.0, 25414.0], [120.0, 25003.0], [127.0, 25024.0], [125.0, 24993.0], [124.0, 24995.0], [135.0, 25095.0], [134.0, 25082.0], [133.0, 25115.0], [132.0, 24952.0], [131.0, 25114.0], [130.0, 25171.0], [129.0, 24978.0], [128.0, 25243.0], [143.0, 25232.0], [142.0, 24936.0], [141.0, 25331.0], [140.0, 25199.0], [139.0, 25317.0], [138.0, 24942.0], [137.0, 25066.0], [136.0, 24948.0], [151.0, 25447.0], [150.0, 25228.0], [149.0, 24888.0], [148.0, 25061.0], [147.0, 24906.0], [146.0, 25114.0], [145.0, 25455.0], [144.0, 25179.0], [159.0, 25424.0], [158.0, 25438.0], [157.0, 25700.0], [156.0, 25813.0], [155.0, 25161.0], [154.0, 24881.0], [153.0, 25885.0], [152.0, 25339.0], [167.0, 24842.0], [166.0, 25551.0], [165.0, 24973.0], [164.0, 24803.0], [162.0, 25101.0], [161.0, 25477.0], [160.0, 24845.0], [175.0, 24931.0], [174.0, 24918.0], [173.0, 25013.0], [172.0, 25038.0], [171.0, 24965.0], [170.0, 24690.0], [169.0, 24709.0], [168.0, 24991.0], [183.0, 24878.0], [182.0, 24771.0], [181.0, 24999.0], [180.0, 24536.0], [179.0, 24783.0], [178.0, 24775.0], [177.0, 25685.0], [176.0, 25079.0], [191.0, 25260.0], [190.0, 25002.0], [189.0, 25004.0], [188.0, 25412.0], [187.0, 25040.0], [186.0, 24998.0], [185.0, 24992.0], [184.0, 24484.0], [199.0, 24990.0], [198.0, 24987.0], [197.0, 24673.0], [196.0, 25686.0], [195.0, 24630.0], [194.0, 24884.0], [193.0, 25100.0], [192.0, 24973.0], [207.0, 25214.0], [206.0, 24864.0], [205.0, 24914.0], [204.0, 24488.0], [203.0, 24803.0], [202.0, 24457.0], [201.0, 25261.0], [200.0, 24519.0], [215.0, 24905.0], [214.0, 24813.0], [213.0, 24972.0], [212.0, 25125.5], [210.0, 25042.0], [209.0, 24874.0], [208.0, 24917.0], [223.0, 25596.0], [222.0, 24876.0], [221.0, 25215.0], [220.0, 24320.0], [219.0, 25111.0], [218.0, 25342.0], [217.0, 24783.0], [216.0, 24839.0], [231.0, 25310.0], [230.0, 24899.0], [229.0, 25352.0], [228.0, 24542.0], [227.0, 24863.0], [226.0, 25517.0], [225.0, 24895.0], [224.0, 24817.0], [239.0, 25157.0], [238.0, 24230.0], [237.0, 25068.0], [236.0, 24692.0], [235.0, 24766.0], [234.0, 25056.0], [233.0, 24700.0], [232.0, 24840.0], [247.0, 24844.0], [246.0, 25216.0], [245.0, 25065.0], [244.0, 24492.0], [243.0, 24704.0], [242.0, 24234.0], [241.0, 25406.0], [240.0, 24729.0], [255.0, 24743.0], [253.0, 24433.0], [252.0, 24702.0], [251.0, 24996.0], [250.0, 24876.0], [249.0, 24240.0], [248.0, 24182.0], [270.0, 24532.0], [271.0, 24335.0], [269.0, 24620.0], [268.0, 24613.0], [267.0, 24080.0], [266.0, 25321.0], [265.0, 24849.0], [264.0, 24207.0], [263.0, 24390.0], [257.0, 25409.0], [256.0, 25117.0], [259.0, 24700.0], [258.0, 25076.0], [262.0, 24824.0], [261.0, 24705.0], [260.0, 25264.0], [286.0, 24501.0], [287.0, 24550.0], [285.0, 24619.0], [284.0, 24734.0], [283.0, 25180.0], [282.0, 24044.0], [281.0, 24492.0], [280.0, 25204.0], [279.0, 25069.0], [273.0, 24911.0], [272.0, 24474.0], [275.0, 24725.0], [274.0, 24994.0], [278.0, 24662.0], [277.0, 24498.0], [276.0, 24041.0], [302.0, 24713.0], [303.0, 24033.0], [301.0, 24044.0], [300.0, 24604.0], [299.0, 24592.0], [298.0, 24272.0], [296.0, 24013.0], [295.0, 24079.0], [289.0, 24615.0], [288.0, 25037.0], [291.0, 24845.0], [290.0, 25114.0], [293.0, 24068.0], [292.0, 24640.0], [318.0, 24706.0], [319.0, 24556.0], [317.0, 24870.0], [316.0, 24771.0], [315.0, 24471.0], [314.0, 24569.0], [313.0, 24807.0], [312.0, 24890.0], [311.0, 24550.0], [304.0, 24649.0], [307.0, 24475.0], [305.0, 24662.0], [310.0, 23967.0], [309.0, 24896.0], [308.0, 24803.0], [334.0, 23748.0], [335.0, 23943.0], [333.0, 24217.0], [332.0, 24046.0], [330.0, 23842.0], [329.0, 23839.0], [328.0, 24216.0], [327.0, 23311.0], [321.0, 24202.0], [320.0, 24457.0], [323.0, 23976.0], [322.0, 24882.0], [326.0, 24301.0], [325.0, 24285.0], [324.0, 23953.0], [350.0, 24038.0], [351.0, 23910.0], [349.0, 23843.0], [348.0, 24094.0], [347.0, 24034.0], [346.0, 24113.0], [345.0, 23155.0], [344.0, 23211.0], [343.0, 24119.0], [337.0, 24364.0], [336.0, 24103.0], [339.0, 23438.0], [338.0, 23817.0], [342.0, 23772.0], [341.0, 23136.0], [340.0, 23135.0], [367.0, 23624.0], [362.0, 12446.0], [366.0, 23038.0], [365.0, 23941.0], [364.0, 23807.0], [355.0, 23830.0], [354.0, 23087.0], [353.0, 23754.0], [352.0, 24135.0], [363.0, 23099.0], [361.0, 23892.0], [360.0, 23033.0], [359.0, 24311.0], [358.0, 23849.5], [356.0, 23801.0], [382.0, 23564.0], [383.0, 23863.0], [381.0, 23768.0], [380.0, 23666.0], [379.0, 23547.0], [378.0, 23706.0], [377.0, 22951.0], [376.0, 24068.0], [375.0, 23562.0], [369.0, 24066.0], [368.0, 24368.0], [371.0, 23630.0], [370.0, 22948.0], [374.0, 23858.0], [373.0, 23533.0], [372.0, 23981.0], [398.0, 22900.0], [399.0, 23562.0], [397.0, 23815.0], [387.0, 23784.0], [386.0, 23684.0], [385.0, 23697.0], [384.0, 23939.0], [395.0, 22914.0], [394.0, 22919.0], [393.0, 23893.0], [392.0, 23480.0], [391.0, 24115.0], [390.0, 24021.0], [389.0, 23520.0], [388.0, 23594.0], [414.0, 22772.0], [415.0, 22778.0], [413.0, 23464.0], [412.0, 22742.0], [411.0, 23420.0], [410.0, 23914.0], [409.0, 23439.0], [408.0, 22835.0], [407.0, 22763.0], [401.0, 22862.0], [400.0, 22856.0], [403.0, 23533.0], [402.0, 23428.0], [406.0, 23470.0], [405.0, 23472.0], [404.0, 23795.0], [430.0, 23678.0], [431.0, 23303.0], [429.0, 23394.0], [428.0, 23167.0], [427.0, 22588.0], [426.0, 23316.0], [425.0, 22625.0], [424.0, 22670.0], [423.0, 22622.0], [417.0, 22690.0], [416.0, 23375.0], [419.0, 23508.0], [418.0, 23436.0], [422.0, 23943.0], [421.0, 23517.0], [420.0, 23753.0], [446.0, 23260.0], [447.0, 23145.0], [445.0, 23561.0], [444.0, 23188.0], [443.0, 23312.0], [442.0, 23269.0], [441.0, 23836.0], [440.0, 23158.0], [439.0, 24140.0], [433.0, 23292.0], [435.0, 23604.0], [434.0, 22508.0], [438.0, 23622.0], [437.0, 23780.0], [436.0, 23199.0], [462.0, 22271.0], [463.0, 23101.0], [461.0, 23290.0], [460.0, 23121.0], [459.0, 23021.0], [458.0, 23158.0], [457.0, 23452.0], [456.0, 23140.0], [455.0, 22980.0], [449.0, 23719.0], [448.0, 23180.0], [451.0, 23640.0], [450.0, 23697.0], [454.0, 23192.0], [453.0, 22391.0], [452.0, 23427.0], [477.0, 22885.0], [478.0, 23224.0], [476.0, 22099.0], [467.0, 23434.0], [466.0, 23502.0], [465.0, 22945.0], [464.0, 23726.0], [475.0, 22983.0], [474.0, 22907.0], [473.0, 23409.0], [472.0, 23522.0], [471.0, 23531.0], [470.0, 22973.0], [469.0, 22090.0], [468.0, 23052.0], [494.0, 22764.0], [495.0, 23060.0], [493.0, 22681.0], [492.0, 23164.0], [491.0, 22850.0], [490.0, 23128.0], [489.0, 23157.0], [488.0, 22876.0], [487.0, 22841.0], [481.0, 22828.0], [480.0, 23287.0], [483.0, 22678.0], [482.0, 23084.0], [486.0, 22758.0], [485.0, 22876.0], [484.0, 23043.0], [510.0, 23029.0], [511.0, 23120.0], [509.0, 23048.0], [508.0, 23241.0], [507.0, 22498.0], [506.0, 22841.0], [505.0, 22726.0], [504.0, 22805.0], [503.0, 22821.0], [497.0, 21965.0], [496.0, 21950.0], [499.0, 22576.0], [498.0, 22795.0], [501.0, 23374.0], [500.0, 23294.0], [540.0, 22804.0], [542.0, 22650.0], [538.0, 22271.0], [536.0, 22654.0], [534.0, 22460.0], [532.0, 22700.0], [530.0, 22499.0], [528.0, 22996.0], [526.0, 22889.0], [514.0, 22543.0], [512.0, 21786.0], [518.0, 22493.0], [516.0, 22428.0], [524.0, 22998.0], [522.0, 22387.0], [520.0, 22666.0], [572.0, 21873.0], [574.0, 22301.0], [570.0, 21707.0], [568.0, 22163.0], [566.0, 22361.0], [564.0, 22312.0], [562.0, 22067.0], [560.0, 22424.0], [558.0, 22623.0], [546.0, 22855.0], [544.0, 22420.0], [550.0, 22519.0], [548.0, 22701.0], [556.0, 22481.0], [554.0, 22223.0], [552.0, 22021.0], [604.0, 21868.0], [606.0, 22343.0], [602.0, 22312.0], [600.0, 21819.0], [598.0, 21574.0], [596.0, 21988.0], [594.0, 21864.0], [592.0, 22326.0], [590.0, 22072.0], [578.0, 21984.0], [576.0, 22180.0], [582.0, 21967.0], [580.0, 22165.0], [588.0, 22473.0], [586.0, 21762.0], [584.0, 22677.0], [636.0, 21542.0], [638.0, 21903.0], [634.0, 21623.0], [632.0, 22075.0], [630.0, 21870.0], [628.0, 22378.0], [626.0, 22196.0], [624.0, 21833.0], [622.0, 21988.0], [608.0, 21814.0], [614.0, 22096.0], [612.0, 21816.0], [620.0, 21816.0], [618.0, 21647.0], [616.0, 22052.0], [668.0, 21753.0], [670.0, 21522.0], [666.0, 21774.0], [664.0, 21699.0], [662.0, 21239.0], [660.0, 22122.0], [658.0, 21652.0], [656.0, 21923.0], [654.0, 21874.0], [642.0, 22071.0], [640.0, 21680.0], [646.0, 21873.0], [644.0, 21878.0], [652.0, 21510.0], [650.0, 21734.0], [648.0, 21622.0], [700.0, 21400.0], [702.0, 21414.0], [698.0, 21260.0], [696.0, 21224.0], [694.0, 22861.0], [692.0, 21357.0], [690.0, 21843.0], [688.0, 21545.0], [686.0, 23914.0], [674.0, 21747.0], [672.0, 21544.0], [678.0, 21277.0], [676.0, 21342.0], [684.0, 21554.0], [682.0, 21596.0], [680.0, 21167.0], [732.0, 21715.0], [716.0, 11590.5], [714.0, 21227.0], [712.0, 22114.0], [718.0, 21576.0], [706.0, 21377.0], [704.0, 21258.0], [710.0, 21706.0], [708.0, 21135.0], [734.0, 21317.0], [730.0, 21455.0], [728.0, 20977.0], [726.0, 20880.0], [724.0, 21292.0], [722.0, 21164.0], [720.0, 21356.0], [764.0, 21398.0], [748.0, 11469.0], [746.0, 21023.0], [744.0, 21027.0], [750.0, 20629.0], [738.0, 20984.0], [736.0, 21115.0], [742.0, 23548.0], [740.0, 21192.0], [766.0, 22267.0], [762.0, 21077.0], [760.0, 21136.0], [758.0, 20703.0], [756.0, 20884.0], [754.0, 21123.0], [752.0, 21088.0], [796.0, 20617.0], [798.0, 20577.0], [794.0, 20452.0], [792.0, 20837.0], [790.0, 20619.0], [788.0, 20738.0], [786.0, 20833.0], [784.0, 20902.0], [782.0, 20976.0], [768.0, 20952.0], [772.0, 20662.0], [770.0, 20634.0], [780.0, 20834.0], [778.0, 20653.0], [776.0, 20314.0], [828.0, 20450.0], [830.0, 22904.0], [826.0, 20349.0], [824.0, 20494.0], [822.0, 22830.0], [820.0, 20402.0], [818.0, 21270.0], [816.0, 20354.0], [814.0, 20255.0], [802.0, 20315.0], [800.0, 20436.0], [806.0, 20523.0], [804.0, 20614.0], [812.0, 20471.5], [810.0, 20525.0], [808.0, 21456.0], [860.0, 20906.0], [862.0, 19928.0], [858.0, 19824.0], [856.0, 20230.0], [854.0, 19927.0], [852.0, 20192.0], [850.0, 20274.0], [848.0, 20181.0], [846.0, 20198.0], [834.0, 20937.0], [832.0, 20504.0], [838.0, 21233.0], [836.0, 20390.0], [844.0, 19991.0], [842.0, 20284.0], [840.0, 20327.0], [892.0, 20661.0], [894.0, 22135.0], [890.0, 20348.0], [888.0, 19983.0], [886.0, 21151.0], [884.0, 19834.0], [882.0, 19978.0], [880.0, 19887.0], [878.0, 19900.0], [866.0, 22027.0], [864.0, 20142.0], [870.0, 19975.0], [868.0, 20728.0], [876.0, 19916.0], [874.0, 19942.0], [872.0, 19854.0], [924.0, 20666.0], [926.0, 19862.0], [922.0, 21647.0], [920.0, 19680.0], [918.0, 19924.0], [916.0, 20820.0], [914.0, 19690.0], [912.0, 20942.0], [910.0, 20978.0], [898.0, 20739.0], [896.0, 19735.0], [902.0, 19777.0], [900.0, 19817.0], [908.0, 20189.0], [906.0, 19707.0], [904.0, 19857.0], [956.0, 19151.0], [958.0, 11780.0], [954.0, 21397.0], [952.0, 19197.0], [950.0, 18806.0], [948.0, 21232.0], [946.0, 19082.0], [944.0, 20822.5], [942.0, 20213.0], [930.0, 20911.0], [928.0, 21245.5], [934.0, 20863.0], [932.0, 20778.0], [940.0, 20807.0], [938.0, 19601.0], [936.0, 20915.0], [990.0, 19323.0], [968.0, 10376.5], [972.0, 19753.0], [970.0, 18980.0], [982.0, 10482.0], [988.0, 18493.0], [986.0, 20756.0], [984.0, 19685.0], [966.0, 18693.0], [964.0, 18679.0], [962.0, 19975.0], [960.0, 21288.0], [974.0, 20951.0], [980.0, 19328.0], [978.0, 18605.0], [976.0, 20200.5], [1020.0, 19322.0], [996.0, 11573.0], [994.0, 19473.0], [992.0, 18241.0], [998.0, 18934.0], [1006.0, 20256.0], [1004.0, 18914.0], [1000.0, 19330.0], [1022.0, 19116.0], [1018.0, 19035.0], [1016.0, 19314.0], [1014.0, 19096.0], [1012.0, 18376.0], [1010.0, 18523.0], [1008.0, 19122.0], [1052.0, 18075.0], [1044.0, 18820.5], [1040.0, 18297.0], [1048.0, 19028.0], [1060.0, 11534.0], [1056.0, 19077.0], [1064.0, 18609.0], [1068.0, 18856.0], [1084.0, 18106.0], [1080.0, 18168.0], [1076.0, 18650.0], [1072.0, 20202.0], [1036.0, 18271.0], [1032.0, 19183.0], [1028.0, 19205.0], [1024.0, 19280.0], [1116.0, 11338.0], [1144.0, 18129.0], [1104.0, 10697.0], [1108.0, 17745.0], [1112.0, 19838.0], [1120.0, 18219.0], [1124.0, 19275.0], [1128.0, 19301.0], [1132.0, 17268.0], [1148.0, 18103.0], [1140.0, 19297.0], [1136.0, 18099.0], [1088.0, 18703.0], [1092.0, 18623.0], [1096.0, 17592.0], [1100.0, 18525.0], [1180.0, 17235.0], [1172.0, 18980.0], [1168.0, 17879.0], [1176.0, 18677.0], [1200.0, 17079.0], [1164.0, 18081.0], [1160.0, 17168.0], [1156.0, 17462.0], [1152.0, 17456.0], [1196.0, 19094.0], [1192.0, 17854.0], [1188.0, 17267.0], [1184.0, 18914.0], [1212.0, 17567.0], [1208.0, 17215.0], [1204.0, 17537.0], [1224.0, 9918.0], [1272.0, 16927.0], [1216.0, 18521.0], [1220.0, 18847.0], [1244.0, 17325.0], [1240.0, 17073.0], [1236.0, 16910.0], [1228.0, 10877.5], [1264.0, 17136.0], [1268.0, 17886.0], [1232.0, 10670.0], [1248.0, 16660.0], [1252.0, 18151.0], [1256.0, 17019.0], [1260.0, 16132.0], [1276.0, 17079.0], [1284.0, 16019.0], [1332.0, 15410.0], [1340.0, 9755.5], [1280.0, 17007.0], [1288.0, 16404.0], [1292.0, 18104.0], [1308.0, 16135.0], [1304.0, 15821.0], [1300.0, 15645.0], [1296.0, 16827.0], [1328.0, 16096.0], [1324.0, 16491.0], [1312.0, 16641.0], [1316.0, 18026.0], [1320.0, 15778.0], [1336.0, 16476.0], [1348.0, 16270.0], [1396.0, 15314.0], [1404.0, 15725.0], [1344.0, 16381.0], [1352.0, 15638.0], [1356.0, 15870.0], [1372.0, 15383.0], [1368.0, 16943.0], [1364.0, 15579.0], [1360.0, 16144.0], [1392.0, 15178.0], [1388.0, 7751.0], [1384.0, 15540.0], [1376.0, 16078.0], [1380.0, 16746.0], [1400.0, 14948.0], [1464.0, 14031.0], [1460.0, 8525.0], [1440.0, 16407.0], [1444.0, 14800.0], [1448.0, 14230.0], [1468.0, 15091.0], [1456.0, 14681.0], [1436.0, 16668.0], [1408.0, 16634.0], [1412.0, 16531.0], [1416.0, 15621.0], [1420.0, 15509.0], [1432.0, 15488.0], [1428.0, 14352.0], [1424.0, 15054.0], [1452.0, 16137.0], [1504.0, 14902.0], [1516.0, 8084.0], [1512.0, 16036.0], [1508.0, 14888.0], [1532.0, 15351.0], [1528.0, 13582.0], [1524.0, 13980.0], [1520.0, 13287.0], [1484.0, 15000.0], [1480.0, 15038.0], [1476.0, 16089.0], [1472.0, 16144.0], [1500.0, 14617.0], [1492.0, 14512.0], [1488.0, 14925.0], [1540.0, 13264.0], [1592.0, 14693.0], [1560.0, 15183.0], [1556.0, 14849.0], [1552.0, 13768.0], [1536.0, 13971.0], [1544.0, 15025.0], [1548.0, 15030.0], [1568.0, 13664.0], [1572.0, 13742.0], [1576.0, 15009.0], [1580.0, 13016.0], [1596.0, 13448.0], [1588.0, 14336.0], [1584.0, 13129.0], [1628.0, 9054.5], [1620.0, 5409.8], [1616.0, 14119.0], [1624.0, 13101.0], [1644.0, 12990.0], [1640.0, 13077.0], [1636.0, 12840.0], [1632.0, 12600.0], [1660.0, 12647.0], [1656.0, 14146.0], [1652.0, 12053.0], [1648.0, 12664.0], [1612.0, 13291.0], [1608.0, 13136.0], [1604.0, 12238.0], [1600.0, 13380.0], [1668.0, 11982.0], [1676.0, 7517.0], [1724.0, 12239.0], [1716.0, 7809.0], [1664.0, 12594.0], [1672.0, 12645.0], [1692.0, 12467.0], [1688.0, 12366.0], [1684.0, 11678.0], [1680.0, 11680.0], [1696.0, 7633.0], [1704.0, 12250.0], [1700.0, 12355.0], [1708.0, 11644.0], [1720.0, 12229.0], [1728.0, 12263.5], [1732.0, 11678.0], [1756.0, 12794.0], [1752.0, 13493.0], [1748.0, 11996.0], [1744.0, 11612.0], [1736.0, 8106.5], [1740.0, 7240.5], [1776.0, 11792.0], [1780.0, 8261.0], [1784.0, 11700.0], [1788.0, 7654.0], [1760.0, 13112.0], [1764.0, 11240.0], [1768.0, 7619.5], [1772.0, 11017.0], [1804.0, 10569.0], [1848.0, 7397.5], [1792.0, 7930.0], [1796.0, 11592.0], [1800.0, 12241.0], [1844.0, 11014.0], [1840.0, 10287.0], [1852.0, 7301.5], [1824.0, 11307.0], [1828.0, 11260.0], [1820.0, 10710.0], [1816.0, 10520.0], [1812.0, 13146.0], [1808.0, 10373.0], [1832.0, 8283.0], [1836.0, 11178.0], [1860.0, 12165.0], [1904.0, 12186.0], [1916.0, 12528.0], [1908.0, 6196.0], [1856.0, 7018.5], [1864.0, 12805.0], [1868.0, 12670.0], [1912.0, 9942.0], [1888.0, 9971.0], [1872.0, 7472.5], [1876.0, 13009.0], [1880.0, 9854.0], [1884.0, 10543.0], [1892.0, 8380.5], [1896.0, 10529.0], [1900.0, 11938.0], [1924.0, 6670.5], [1932.0, 6213.333333333333], [1948.0, 8004.5], [1944.0, 13289.0], [1940.0, 13372.0], [1936.0, 11163.0], [1920.0, 10039.0], [1928.0, 11412.0], [1976.0, 5580.25], [1980.0, 9772.0], [1956.0, 9100.0], [1952.0, 9608.0], [1960.0, 11060.0], [1964.0, 9924.0], [1972.0, 6773.5], [1968.0, 9465.0], [1996.0, 10352.0], [1988.0, 6390.0], [1984.0, 9346.0], [1992.0, 8229.0], [2016.0, 9335.0], [2044.0, 9927.0], [2036.0, 9182.0], [2040.0, 6300.333333333333], [2032.0, 5634.333333333333], [2020.0, 8093.0], [2024.0, 10145.0], [2028.0, 6674.0], [2000.0, 9465.0], [2004.0, 11106.0], [2008.0, 9405.0], [2012.0, 10665.0], [2056.0, 10288.0], [2048.0, 7646.0], [2104.0, 9829.0], [2096.0, 6949.0], [2088.0, 6747.0], [2080.0, 10557.0], [2072.0, 7085.0], [2144.0, 9778.0], [2160.0, 9750.0], [2168.0, 9079.0], [2112.0, 5612.75], [2120.0, 6990.5], [2128.0, 9249.0], [2136.0, 9758.0], [2064.0, 10325.0], [2184.0, 8998.0], [2232.0, 8765.0], [2176.0, 10478.0], [2224.0, 10085.0], [2216.0, 9030.0], [2208.0, 6833.0], [2192.0, 6111.5], [2200.0, 10278.0], [2288.0, 7980.0], [2296.0, 9560.0], [2272.0, 6372.0], [2280.0, 8225.0], [2264.0, 9804.0], [2248.0, 8370.0], [2240.0, 10052.0], [2256.0, 9800.0], [2416.0, 7013.0], [2408.0, 7466.0], [2424.0, 7214.0], [2368.0, 8070.0], [2376.0, 7729.0], [2384.0, 8810.0], [2392.0, 8178.0], [2400.0, 6945.0], [2304.0, 7971.0], [2312.0, 8281.0], [2320.0, 7814.0], [2328.0, 7900.0], [2360.0, 7618.0], [2352.0, 9069.0], [2344.0, 7621.0], [2336.0, 8049.0], [2544.0, 5977.0], [2552.0, 5714.0], [2496.0, 7658.0], [2504.0, 7606.0], [2512.0, 5900.0], [2520.0, 5371.0], [2536.0, 6835.0], [2528.0, 5797.0], [2432.0, 7161.0], [2440.0, 6458.0], [2448.0, 6524.5], [2456.0, 8178.0], [2488.0, 6795.0], [2480.0, 5952.0], [2472.0, 6109.0], [2464.0, 6610.0], [2584.0, 5755.5], [2576.0, 5665.0], [2568.0, 5593.333333333333], [2560.0, 6671.0], [2049.0, 10730.0], [2057.0, 7732.0], [2105.0, 11120.0], [2097.0, 8987.0], [2089.0, 9643.0], [2081.0, 7483.0], [2065.0, 6685.5], [2073.0, 7546.0], [2145.0, 9192.0], [2153.0, 6152.666666666667], [2161.0, 6926.0], [2113.0, 8264.0], [2169.0, 8930.0], [2121.0, 7660.0], [2137.0, 8817.0], [2129.0, 9619.0], [2185.0, 9469.0], [2177.0, 7173.0], [2233.0, 8732.0], [2225.0, 10084.0], [2217.0, 10338.0], [2209.0, 5739.2], [2201.0, 8910.0], [2249.0, 5963.25], [2297.0, 9530.0], [2289.0, 6152.333333333333], [2281.0, 7176.0], [2273.0, 6449.0], [2265.0, 8313.0], [2257.0, 8615.0], [2193.0, 9334.0], [2417.0, 7162.0], [2409.0, 7253.0], [2425.0, 6662.0], [2369.0, 8878.0], [2377.0, 7120.0], [2385.0, 7090.0], [2393.0, 7221.0], [2401.0, 6773.0], [2305.0, 8074.0], [2313.0, 7949.0], [2321.0, 8117.0], [2329.0, 8353.0], [2361.0, 7860.0], [2353.0, 7580.0], [2345.0, 7404.0], [2337.0, 7983.0], [2545.0, 6982.0], [2553.0, 5676.0], [2497.0, 7722.0], [2505.0, 6804.0], [2513.0, 6730.0], [2521.0, 5928.0], [2537.0, 5320.0], [2529.0, 5619.0], [2433.0, 6510.0], [2441.0, 6566.0], [2449.0, 6818.0], [2457.0, 8063.0], [2489.0, 6712.0], [2481.0, 6885.0], [2473.0, 5998.0], [2577.0, 6027.428571428572], [2569.0, 6127.0], [2561.0, 5647.0], [2585.0, 6148.333333333333], [1081.0, 19892.0], [1045.0, 17975.0], [1041.0, 19141.0], [1049.0, 10631.0], [1057.0, 18319.0], [1061.0, 18054.0], [1065.0, 18071.0], [1069.0, 18857.0], [1085.0, 19673.0], [1077.0, 19947.0], [1073.0, 18836.0], [1053.0, 20102.0], [1037.0, 19942.0], [1033.0, 19127.0], [1029.0, 20457.0], [1025.0, 20076.0], [1145.0, 11049.0], [1121.0, 18038.0], [1125.0, 19332.0], [1129.0, 17971.0], [1149.0, 18910.0], [1141.0, 19464.0], [1137.0, 19582.0], [1089.0, 18576.0], [1093.0, 17531.0], [1097.0, 18661.0], [1101.0, 18621.0], [1117.0, 17683.0], [1113.0, 18489.0], [1109.0, 18595.0], [1105.0, 17843.0], [1133.0, 19582.0], [1153.0, 19365.0], [1173.0, 18002.0], [1169.0, 18994.0], [1177.0, 17883.0], [1157.0, 17275.0], [1181.0, 19003.0], [1193.0, 16764.0], [1189.0, 17780.0], [1185.0, 17176.0], [1197.0, 18639.0], [1213.0, 17594.0], [1209.0, 18832.0], [1205.0, 17674.0], [1201.0, 17743.0], [1165.0, 18037.0], [1217.0, 10874.5], [1273.0, 17069.0], [1245.0, 16835.0], [1241.0, 17307.0], [1237.0, 18396.0], [1229.0, 9858.5], [1225.0, 17546.0], [1221.0, 17584.0], [1265.0, 16537.0], [1269.0, 16719.0], [1233.0, 10359.0], [1249.0, 16749.0], [1253.0, 18233.0], [1257.0, 17215.0], [1261.0, 18374.0], [1277.0, 16388.0], [1329.0, 15588.0], [1333.0, 10074.0], [1341.0, 9678.0], [1337.0, 15952.0], [1293.0, 16918.0], [1289.0, 17989.0], [1285.0, 16918.0], [1281.0, 16204.0], [1309.0, 15590.0], [1305.0, 16740.0], [1301.0, 16551.0], [1297.0, 16800.0], [1325.0, 16483.0], [1317.0, 15772.0], [1313.0, 17988.0], [1401.0, 15804.0], [1361.0, 9295.5], [1365.0, 16966.0], [1369.0, 10308.5], [1389.0, 5336.333333333333], [1385.0, 8325.0], [1377.0, 16068.0], [1381.0, 14850.0], [1405.0, 17090.0], [1397.0, 16752.0], [1393.0, 15746.0], [1345.0, 17736.0], [1349.0, 15183.0], [1353.0, 15654.0], [1357.0, 15948.0], [1373.0, 15738.0], [1465.0, 15843.0], [1469.0, 14950.0], [1441.0, 15261.0], [1445.0, 15257.0], [1449.0, 16203.0], [1457.0, 14445.0], [1421.0, 15354.0], [1417.0, 14772.0], [1413.0, 14883.0], [1409.0, 15626.0], [1437.0, 15284.0], [1433.0, 14557.0], [1425.0, 15553.0], [1453.0, 14932.0], [1529.0, 13990.0], [1501.0, 16118.0], [1497.0, 14805.0], [1493.0, 13796.0], [1489.0, 14958.0], [1505.0, 16078.0], [1509.0, 13700.0], [1513.0, 14416.0], [1533.0, 12824.0], [1525.0, 13818.0], [1521.0, 13523.0], [1485.0, 14103.0], [1481.0, 14243.0], [1477.0, 13984.0], [1473.0, 15089.0], [1517.0, 13709.0], [1537.0, 14767.0], [1589.0, 13517.0], [1597.0, 14675.0], [1561.0, 12940.0], [1557.0, 13323.0], [1553.0, 13451.0], [1541.0, 13872.0], [1545.0, 13898.0], [1549.0, 13890.0], [1565.0, 13713.0], [1585.0, 13275.0], [1569.0, 8091.5], [1573.0, 13134.0], [1577.0, 12690.0], [1581.0, 12726.0], [1593.0, 12494.0], [1605.0, 12986.0], [1653.0, 12427.0], [1661.0, 12728.0], [1609.0, 7954.0], [1601.0, 12674.0], [1629.0, 12379.0], [1625.0, 12001.0], [1621.0, 13102.0], [1617.0, 14283.0], [1613.0, 7579.0], [1641.0, 6616.666666666666], [1645.0, 7562.0], [1633.0, 12308.0], [1637.0, 12395.0], [1657.0, 12207.0], [1649.0, 11922.0], [1665.0, 12738.0], [1677.0, 6904.333333333334], [1681.0, 12370.0], [1685.0, 12276.0], [1689.0, 13482.0], [1669.0, 11895.0], [1673.0, 12797.0], [1693.0, 9548.0], [1697.0, 12228.0], [1701.0, 12378.0], [1705.0, 11715.0], [1709.0, 12147.0], [1717.0, 8432.5], [1713.0, 12569.5], [1725.0, 13196.0], [1721.0, 11800.0], [1777.0, 11623.0], [1733.0, 6889.0], [1757.0, 8705.5], [1729.0, 12036.0], [1781.0, 10867.0], [1741.0, 12815.0], [1737.0, 11387.0], [1785.0, 11661.0], [1765.0, 11040.0], [1761.0, 10789.0], [1789.0, 12524.0], [1769.0, 7508.5], [1773.0, 11605.0], [1749.0, 8115.5], [1745.0, 13341.0], [1753.0, 12927.0], [1805.0, 12813.0], [1845.0, 13083.0], [1853.0, 10972.0], [1841.0, 11009.0], [1801.0, 12313.0], [1797.0, 10568.0], [1817.0, 10923.0], [1813.0, 14615.0], [1809.0, 10615.0], [1793.0, 12298.0], [1821.0, 11258.0], [1833.0, 10224.0], [1837.0, 12160.0], [1825.0, 12176.0], [1829.0, 14475.0], [1849.0, 13085.0], [1857.0, 9873.0], [1869.0, 6537.0], [1865.0, 10865.0], [1861.0, 10892.0], [1905.0, 7286.5], [1909.0, 9788.0], [1885.0, 5535.75], [1881.0, 10603.0], [1877.0, 12314.0], [1873.0, 10375.0], [1893.0, 6882.5], [1889.0, 11497.0], [1897.0, 12600.0], [1901.0, 13612.0], [1917.0, 9786.0], [1913.0, 9700.0], [1921.0, 7011.5], [1973.0, 5738.333333333333], [1941.0, 7346.333333333334], [1937.0, 12048.0], [1945.0, 9897.0], [1949.0, 10867.0], [1925.0, 7673.5], [1929.0, 6660.0], [1933.0, 9648.0], [1977.0, 8641.0], [1981.0, 11413.0], [1957.0, 9634.0], [1961.0, 9969.0], [1965.0, 9839.0], [1969.0, 9539.0], [1997.0, 6808.0], [1985.0, 4281.0], [1989.0, 10628.0], [1993.0, 9628.0], [2017.0, 9384.0], [2045.0, 7364.0], [2041.0, 5319.2], [2037.0, 6714.5], [2033.0, 7808.0], [2021.0, 6580.0], [2025.0, 7662.0], [2029.0, 9163.0], [2001.0, 11150.0], [2005.0, 9453.0], [2009.0, 10658.0], [2013.0, 9422.0], [2074.0, 12271.0], [2050.0, 7638.0], [2106.0, 9500.0], [2098.0, 9441.0], [2090.0, 9471.0], [2082.0, 6406.0], [2146.0, 6657.0], [2154.0, 6996.0], [2162.0, 10633.0], [2114.0, 9488.0], [2122.0, 7740.5], [2130.0, 7612.0], [2138.0, 10865.0], [2066.0, 10794.0], [2178.0, 7635.5], [2186.0, 8927.0], [2234.0, 8408.0], [2226.0, 5579.0], [2210.0, 4994.5], [2218.0, 8690.0], [2194.0, 6784.0], [2202.0, 8936.0], [2290.0, 7013.5], [2298.0, 8079.0], [2282.0, 6755.5], [2274.0, 8156.0], [2266.0, 6141.666666666667], [2250.0, 6286.0], [2242.0, 8764.5], [2258.0, 8798.0], [2418.0, 7027.0], [2426.0, 8164.0], [2370.0, 8862.0], [2378.0, 7072.0], [2386.0, 7140.0], [2394.0, 7257.0], [2410.0, 7238.0], [2402.0, 8622.0], [2306.0, 9484.0], [2314.0, 7980.0], [2322.0, 8112.0], [2330.0, 7524.0], [2362.0, 7947.0], [2354.0, 8108.0], [2346.0, 8127.0], [2338.0, 7511.0], [2554.0, 4927.0], [2498.0, 6443.0], [2506.0, 7288.0], [2514.0, 6028.0], [2522.0, 5695.0], [2546.0, 6641.0], [2538.0, 6244.0], [2530.0, 5241.0], [2434.0, 8148.0], [2442.0, 8265.0], [2450.0, 8012.0], [2458.0, 6605.0], [2490.0, 6876.0], [2482.0, 7823.0], [2474.0, 6580.0], [2466.0, 7379.5], [2570.0, 5293.333333333333], [2562.0, 6766.0], [2578.0, 6124.666666666667], [2586.0, 5371.0], [2059.0, 9524.0], [2051.0, 10408.0], [2107.0, 9796.0], [2099.0, 7050.5], [2091.0, 7578.0], [2083.0, 9414.0], [2067.0, 6167.333333333333], [2075.0, 10769.0], [2147.0, 9385.0], [2155.0, 9441.0], [2163.0, 9544.0], [2171.0, 9169.5], [2115.0, 7019.5], [2139.0, 9723.0], [2131.0, 9900.0], [2123.0, 9771.0], [2187.0, 6088.5], [2179.0, 10570.0], [2235.0, 9088.0], [2227.0, 10164.0], [2219.0, 10176.0], [2211.0, 8958.5], [2203.0, 9030.0], [2243.0, 8594.0], [2299.0, 7835.0], [2291.0, 7933.0], [2283.0, 8587.0], [2275.0, 8001.0], [2251.0, 6035.6], [2267.0, 6670.5], [2259.0, 8169.0], [2195.0, 8926.0], [2419.0, 8353.0], [2427.0, 8238.0], [2371.0, 8741.0], [2379.0, 7412.0], [2387.0, 6997.0], [2395.0, 8664.0], [2411.0, 8619.0], [2403.0, 6774.0], [2307.0, 8135.0], [2315.0, 8347.0], [2323.0, 8241.0], [2331.0, 7655.0], [2363.0, 7472.0], [2355.0, 9026.0], [2347.0, 8167.0], [2339.0, 7465.0], [2547.0, 5652.0], [2555.0, 6714.0], [2499.0, 6333.0], [2507.0, 5765.0], [2515.0, 6075.0], [2523.0, 5557.0], [2539.0, 7184.0], [2531.0, 5939.0], [2435.0, 6744.0], [2443.0, 7161.0], [2451.0, 6838.0], [2459.0, 6147.0], [2491.0, 6785.0], [2483.0, 7771.0], [2475.0, 6731.0], [2467.0, 7182.0], [2571.0, 5680.0], [2563.0, 5226.0], [2579.0, 5762.333333333333], [2587.0, 5769.6], [541.0, 22521.0], [543.0, 22572.0], [539.0, 23192.0], [537.0, 22969.0], [535.0, 22858.0], [533.0, 22163.0], [531.0, 22615.0], [529.0, 22560.0], [527.0, 22734.0], [515.0, 23021.0], [513.0, 22799.0], [519.0, 22619.0], [517.0, 22448.0], [525.0, 21686.0], [523.0, 22586.0], [521.0, 22587.0], [571.0, 22007.0], [573.0, 22312.0], [569.0, 21033.0], [551.0, 22864.0], [549.0, 22219.0], [547.0, 21426.0], [545.0, 21447.0], [567.0, 21964.0], [565.0, 22239.0], [563.0, 22160.0], [561.0, 22434.0], [559.0, 22616.0], [557.0, 22152.0], [555.0, 22623.0], [553.0, 22528.0], [605.0, 21666.0], [607.0, 22366.0], [603.0, 22357.0], [601.0, 22291.0], [599.0, 22009.0], [597.0, 21878.0], [595.0, 22436.0], [593.0, 22300.0], [591.0, 22257.0], [579.0, 22429.0], [577.0, 22122.0], [583.0, 22357.0], [581.0, 22354.0], [589.0, 21903.0], [587.0, 21952.0], [585.0, 22569.0], [637.0, 21371.0], [639.0, 21805.0], [635.0, 21812.0], [633.0, 22464.0], [631.0, 22198.0], [629.0, 22086.0], [627.0, 22259.0], [625.0, 21630.0], [623.0, 21985.0], [611.0, 22157.0], [609.0, 22017.0], [615.0, 22152.0], [613.0, 22032.0], [621.0, 21566.0], [619.0, 22201.0], [617.0, 21651.0], [669.0, 21842.0], [671.0, 21297.0], [667.0, 21908.0], [665.0, 21629.0], [663.0, 21787.0], [661.0, 21728.0], [659.0, 21883.0], [657.0, 21283.0], [655.0, 22119.0], [643.0, 21801.0], [641.0, 21752.0], [647.0, 21670.0], [645.0, 21375.0], [653.0, 21769.0], [651.0, 21675.0], [649.0, 21318.0], [701.0, 21577.0], [703.0, 21265.0], [699.0, 21543.0], [697.0, 21268.0], [695.0, 21060.0], [693.0, 21791.0], [691.0, 21556.0], [689.0, 21053.0], [687.0, 21570.0], [673.0, 21453.0], [679.0, 21249.0], [677.0, 21465.0], [685.0, 21381.0], [683.0, 21135.0], [681.0, 21440.0], [733.0, 20846.0], [735.0, 21110.0], [731.0, 22661.0], [729.0, 20773.0], [727.0, 21107.0], [725.0, 21175.0], [723.0, 20832.0], [721.0, 21110.0], [719.0, 22749.0], [707.0, 22841.0], [705.0, 21120.0], [711.0, 21082.0], [709.0, 21271.0], [717.0, 21608.0], [715.0, 20830.0], [713.0, 21607.0], [765.0, 20862.0], [767.0, 21111.0], [763.0, 20779.0], [761.0, 20634.0], [759.0, 21002.0], [757.0, 21116.0], [755.0, 20794.0], [753.0, 20583.0], [751.0, 23295.0], [739.0, 21314.0], [737.0, 22348.0], [743.0, 21257.0], [741.0, 20628.0], [749.0, 21088.0], [747.0, 20919.0], [745.0, 20907.0], [797.0, 20651.0], [799.0, 20633.0], [795.0, 20577.0], [793.0, 20829.0], [791.0, 20526.0], [789.0, 20298.0], [787.0, 21592.0], [785.0, 21653.0], [783.0, 20889.0], [771.0, 20886.0], [769.0, 20429.0], [775.0, 20430.0], [773.0, 20914.0], [781.0, 20775.0], [779.0, 21007.0], [777.0, 21378.0], [829.0, 20577.0], [813.0, 11262.5], [809.0, 20699.0], [815.0, 20483.0], [803.0, 20497.0], [801.0, 20538.0], [807.0, 21070.0], [805.0, 20621.0], [831.0, 20174.0], [827.0, 20077.0], [825.0, 20193.0], [823.0, 20319.0], [821.0, 20445.0], [819.0, 20201.0], [817.0, 20667.0], [861.0, 20111.0], [863.0, 19881.0], [859.0, 20116.0], [857.0, 20014.0], [855.0, 20149.0], [853.0, 20010.0], [851.0, 19843.0], [849.0, 19924.0], [847.0, 20158.0], [835.0, 20224.0], [833.0, 20203.0], [839.0, 20179.0], [837.0, 20380.0], [845.0, 21474.0], [843.0, 20486.0], [841.0, 20715.0], [893.0, 19813.0], [895.0, 21095.0], [889.0, 19826.0], [871.0, 19980.0], [869.0, 19665.0], [867.0, 19870.0], [865.0, 20128.0], [887.0, 20366.0], [885.0, 20768.0], [883.0, 19986.0], [881.0, 19979.0], [879.0, 20089.0], [877.0, 21240.0], [875.0, 21294.0], [873.0, 21283.0], [925.0, 19705.0], [917.0, 12241.0], [923.0, 19684.0], [921.0, 20965.0], [919.0, 20957.0], [915.0, 19742.0], [913.0, 19872.0], [911.0, 20040.0], [897.0, 20945.0], [901.0, 20987.0], [899.0, 19807.0], [909.0, 20972.0], [907.0, 19915.0], [905.0, 21863.0], [957.0, 19351.0], [959.0, 19680.0], [955.0, 20717.0], [953.0, 20911.0], [951.0, 18939.0], [949.0, 19128.0], [947.0, 19498.0], [945.0, 19118.0], [941.0, 19976.0], [931.0, 20810.0], [929.0, 20753.0], [935.0, 19688.0], [933.0, 21833.0], [939.0, 19655.0], [937.0, 19886.0], [989.0, 19549.0], [965.0, 11666.5], [963.0, 19778.0], [961.0, 20677.0], [967.0, 19775.0], [973.0, 21068.0], [971.0, 19857.0], [969.0, 19833.0], [991.0, 20462.0], [987.0, 19098.0], [985.0, 20968.0], [983.0, 18911.0], [981.0, 20665.0], [979.0, 19490.0], [977.0, 19115.0], [1021.0, 18873.0], [1023.0, 18758.0], [1019.0, 20009.0], [1017.0, 20678.0], [1015.0, 19330.0], [1013.0, 18820.0], [1011.0, 19277.0], [1009.0, 19421.0], [1007.0, 19332.0], [995.0, 19188.0], [993.0, 20812.0], [999.0, 19449.0], [997.0, 19480.0], [1005.0, 19452.0], [1003.0, 19313.5], [1001.0, 19537.0], [1038.0, 10879.0], [1082.0, 18398.0], [1046.0, 8039.333333333333], [1042.0, 19949.0], [1050.0, 19091.0], [1054.0, 18029.0], [1034.0, 18097.0], [1030.0, 20560.0], [1026.0, 18849.0], [1058.0, 19004.0], [1062.0, 20118.0], [1066.0, 18643.0], [1070.0, 18406.0], [1086.0, 17980.0], [1078.0, 19777.0], [1074.0, 20158.0], [1150.0, 18133.0], [1106.0, 18027.0], [1110.0, 17588.0], [1114.0, 17931.0], [1122.0, 17787.0], [1126.0, 19581.0], [1130.0, 18367.0], [1134.0, 18273.0], [1146.0, 18148.0], [1142.0, 18163.0], [1138.0, 18235.0], [1118.0, 18447.0], [1090.0, 18606.0], [1094.0, 18582.0], [1098.0, 19798.0], [1102.0, 18519.0], [1158.0, 17308.0], [1210.0, 18931.0], [1174.0, 7968.666666666667], [1170.0, 17920.0], [1178.0, 17188.0], [1166.0, 17961.0], [1162.0, 17448.5], [1154.0, 17179.0], [1182.0, 17460.0], [1198.0, 10389.5], [1194.0, 18668.0], [1190.0, 17817.0], [1186.0, 17909.0], [1214.0, 9911.0], [1206.0, 17687.0], [1202.0, 19051.0], [1218.0, 10724.0], [1222.0, 17521.0], [1246.0, 17292.0], [1242.0, 17313.0], [1238.0, 18516.0], [1226.0, 17126.0], [1230.0, 16472.0], [1266.0, 18060.0], [1270.0, 18441.0], [1234.0, 10764.0], [1278.0, 18062.0], [1254.0, 17181.0], [1258.0, 16341.0], [1262.0, 17155.0], [1274.0, 17969.0], [1282.0, 16429.0], [1310.0, 9915.5], [1286.0, 18205.0], [1290.0, 16033.0], [1294.0, 15800.0], [1306.0, 16794.0], [1302.0, 16738.0], [1298.0, 18091.0], [1330.0, 16359.0], [1322.0, 11955.0], [1326.0, 9737.0], [1342.0, 15922.0], [1314.0, 18007.0], [1318.0, 17743.0], [1338.0, 16444.0], [1334.0, 16455.0], [1350.0, 9415.5], [1346.0, 16258.0], [1354.0, 17087.0], [1358.0, 15148.0], [1374.0, 17016.0], [1370.0, 17270.0], [1366.0, 16173.0], [1362.0, 15694.0], [1394.0, 15184.0], [1382.0, 6323.0], [1390.0, 15593.0], [1386.0, 9915.5], [1406.0, 15761.0], [1378.0, 15986.0], [1402.0, 15299.0], [1398.0, 17181.0], [1466.0, 14297.0], [1470.0, 14721.0], [1442.0, 15158.0], [1446.0, 14969.0], [1450.0, 16257.0], [1462.0, 15492.5], [1458.0, 14840.0], [1410.0, 15281.0], [1414.0, 15000.0], [1418.0, 15475.0], [1422.0, 14722.0], [1434.0, 14796.0], [1430.0, 16804.5], [1426.0, 14948.0], [1454.0, 14889.0], [1534.0, 13976.0], [1530.0, 13912.0], [1514.0, 14062.0], [1510.0, 14811.0], [1506.0, 14832.0], [1518.0, 14958.0], [1526.0, 13896.0], [1522.0, 14107.0], [1486.0, 14965.0], [1482.0, 14959.0], [1478.0, 16113.0], [1474.0, 14658.0], [1502.0, 14791.0], [1498.0, 14852.0], [1494.0, 13907.0], [1490.0, 15918.0], [1538.0, 13269.0], [1562.0, 8844.0], [1558.0, 14998.0], [1566.0, 13735.0], [1546.0, 14769.0], [1550.0, 12927.0], [1598.0, 14564.0], [1570.0, 12688.0], [1574.0, 13541.0], [1578.0, 14526.0], [1582.0, 13501.0], [1594.0, 13477.0], [1590.0, 12657.0], [1586.0, 13515.0], [1634.0, 14327.0], [1658.0, 12464.0], [1630.0, 6743.666666666666], [1618.0, 13221.0], [1622.0, 8553.0], [1626.0, 14133.0], [1646.0, 6564.333333333334], [1642.0, 12282.0], [1638.0, 12122.0], [1662.0, 11783.0], [1654.0, 14005.0], [1650.0, 12308.0], [1614.0, 14459.0], [1610.0, 12820.0], [1606.0, 14198.0], [1602.0, 13307.0], [1666.0, 11830.0], [1714.0, 11342.0], [1678.0, 12447.0], [1718.0, 13527.0], [1694.0, 6903.0], [1670.0, 12031.0], [1674.0, 12587.0], [1690.0, 11629.0], [1686.0, 12470.0], [1682.0, 13704.0], [1706.0, 8383.0], [1702.0, 11516.0], [1698.0, 12391.0], [1710.0, 12298.0], [1726.0, 12208.0], [1722.0, 12309.0], [1734.0, 8127.0], [1738.0, 8104.5], [1758.0, 7322.0], [1730.0, 11799.0], [1754.0, 12832.0], [1750.0, 11508.0], [1746.0, 12010.0], [1742.0, 12088.0], [1778.0, 11665.0], [1786.0, 7324.0], [1782.0, 10999.0], [1790.0, 8439.0], [1762.0, 10845.0], [1766.0, 11871.0], [1774.0, 11837.0], [1770.0, 11580.0], [1842.0, 10051.0], [1806.0, 7472.0], [1798.0, 10574.0], [1802.0, 12456.0], [1846.0, 7187.5], [1850.0, 10452.0], [1854.0, 9951.0], [1826.0, 12466.0], [1822.0, 7666.0], [1818.0, 11404.0], [1814.0, 12592.0], [1810.0, 12809.0], [1830.0, 6968.5], [1834.0, 11219.0], [1838.0, 12080.0], [1870.0, 10825.0], [1858.0, 10091.0], [1862.0, 10576.0], [1866.0, 9998.0], [1906.0, 11171.0], [1910.0, 7611.5], [1914.0, 11654.0], [1918.0, 7389.0], [1874.0, 13035.0], [1878.0, 10692.0], [1882.0, 11721.0], [1886.0, 3648.0], [1890.0, 7800.5], [1894.0, 10560.0], [1898.0, 10413.0], [1902.0, 6280.666666666666], [1926.0, 7509.5], [1950.0, 7118.5], [1946.0, 11284.0], [1942.0, 12005.0], [1938.0, 10142.0], [1922.0, 11227.0], [1930.0, 6303.0], [1934.0, 7387.5], [1974.0, 7006.5], [1978.0, 9693.0], [1982.0, 6200.0], [1954.0, 10587.0], [1958.0, 9442.0], [1962.0, 9322.0], [1966.0, 8992.0], [1970.0, 9813.0], [1998.0, 9542.0], [1986.0, 9444.5], [1990.0, 9075.0], [1994.0, 7917.5], [2018.0, 6559.666666666667], [2046.0, 7502.0], [2042.0, 6748.0], [2038.0, 6988.666666666666], [2034.0, 6065.333333333333], [2022.0, 10362.0], [2026.0, 12511.0], [2030.0, 11444.0], [2002.0, 6074.666666666667], [2006.0, 10391.0], [2010.0, 10268.0], [2014.0, 7344.0], [2060.0, 4063.0], [2052.0, 10164.0], [2108.0, 9532.0], [2100.0, 6481.5], [2092.0, 8956.0], [2084.0, 10256.0], [2076.0, 11028.0], [2148.0, 9586.0], [2156.0, 9387.0], [2164.0, 7436.0], [2172.0, 9265.0], [2116.0, 9322.0], [2124.0, 9692.0], [2132.0, 9566.0], [2140.0, 9815.0], [2068.0, 10430.0], [2188.0, 7104.5], [2180.0, 7399.5], [2236.0, 6535.0], [2228.0, 8861.0], [2220.0, 7191.0], [2212.0, 8522.0], [2204.0, 6865.0], [2196.0, 8625.0], [2284.0, 9572.0], [2292.0, 8394.0], [2300.0, 7730.0], [2276.0, 8674.0], [2260.0, 6936.5], [2268.0, 8822.0], [2244.0, 8802.0], [2252.0, 8364.0], [2428.0, 7561.0], [2372.0, 8770.0], [2380.0, 7890.0], [2388.0, 7026.0], [2396.0, 8748.0], [2420.0, 8353.0], [2412.0, 7080.0], [2404.0, 7442.0], [2308.0, 8057.0], [2316.0, 9312.0], [2324.0, 9348.0], [2332.0, 7501.0], [2364.0, 7738.0], [2356.0, 8959.0], [2348.0, 8070.0], [2340.0, 8157.0], [2556.0, 4922.0], [2548.0, 5985.0], [2500.0, 6615.0], [2508.0, 5520.0], [2516.0, 6162.0], [2524.0, 5433.0], [2540.0, 6132.0], [2532.0, 5671.0], [2436.0, 8022.0], [2444.0, 7214.0], [2452.0, 8249.0], [2460.0, 7434.0], [2492.0, 6645.0], [2484.0, 7851.0], [2476.0, 6487.0], [2468.0, 6730.0], [2580.0, 5739.5], [2572.0, 6075.0], [2564.0, 5956.0], [2588.0, 6079.0], [2061.0, 8439.0], [2053.0, 7105.5], [2109.0, 10223.0], [2101.0, 6665.0], [2093.0, 8114.0], [2085.0, 9363.0], [2069.0, 10928.0], [2077.0, 6299.75], [2149.0, 10842.0], [2157.0, 9582.0], [2165.0, 9382.0], [2173.0, 8960.0], [2117.0, 9982.0], [2141.0, 9106.0], [2133.0, 9086.0], [2125.0, 9972.0], [2189.0, 10473.0], [2197.0, 6378.333333333333], [2181.0, 8723.0], [2237.0, 6845.5], [2229.0, 8494.0], [2221.0, 8732.0], [2213.0, 9129.0], [2205.0, 7382.5], [2301.0, 8087.0], [2293.0, 8632.0], [2285.0, 9680.0], [2277.0, 8072.0], [2253.0, 6888.5], [2261.0, 9958.0], [2269.0, 8206.0], [2429.0, 7042.0], [2373.0, 8854.0], [2381.0, 7312.0], [2389.0, 7796.0], [2397.0, 6833.0], [2421.0, 6991.0], [2413.0, 7423.0], [2405.0, 6822.0], [2309.0, 9438.0], [2317.0, 7740.0], [2325.0, 8396.0], [2333.0, 7504.0], [2365.0, 8018.0], [2357.0, 7534.0], [2349.0, 7765.0], [2341.0, 8130.0], [2549.0, 4886.0], [2501.0, 6729.0], [2509.0, 6069.0], [2517.0, 5648.0], [2525.0, 5540.0], [2557.0, 5686.0], [2541.0, 5920.0], [2533.0, 5659.0], [2437.0, 6656.0], [2445.0, 7151.0], [2453.0, 7036.0], [2461.0, 6707.0], [2493.0, 6837.0], [2485.0, 7841.0], [2477.0, 6338.0], [2469.0, 6777.0], [2573.0, 5162.0], [2565.0, 6162.0], [2581.0, 5570.666666666667], [2589.0, 5907.0], [1087.0, 18696.0], [1047.0, 11375.5], [1059.0, 20259.0], [1063.0, 20370.0], [1067.0, 18891.0], [1071.0, 19600.0], [1083.0, 18781.0], [1079.0, 18761.0], [1075.0, 18651.0], [1039.0, 20199.0], [1035.0, 20395.0], [1031.0, 18991.0], [1027.0, 18902.0], [1055.0, 20199.0], [1051.0, 19068.0], [1147.0, 19507.0], [1151.0, 18098.0], [1123.0, 18432.0], [1127.0, 19187.0], [1131.0, 18309.0], [1143.0, 17182.0], [1139.0, 19480.0], [1119.0, 18176.0], [1091.0, 18659.0], [1095.0, 18609.0], [1099.0, 19581.0], [1103.0, 18254.0], [1115.0, 17844.0], [1111.0, 18034.0], [1107.0, 17476.0], [1135.0, 19478.0], [1159.0, 10975.0], [1211.0, 16670.0], [1175.0, 10995.0], [1171.0, 17971.0], [1179.0, 17217.0], [1183.0, 19283.0], [1155.0, 18147.0], [1195.0, 10307.0], [1191.0, 18815.0], [1187.0, 17839.0], [1215.0, 17571.0], [1207.0, 17635.0], [1203.0, 17700.0], [1167.0, 17951.0], [1163.0, 17706.0], [1223.0, 18282.0], [1219.0, 10338.0], [1247.0, 18658.0], [1243.0, 18500.0], [1239.0, 16755.0], [1227.0, 18297.0], [1231.0, 16744.0], [1267.0, 17133.0], [1271.0, 17952.0], [1235.0, 7728.0], [1279.0, 18431.0], [1251.0, 18464.0], [1255.0, 16894.0], [1259.0, 18344.0], [1263.0, 17137.0], [1275.0, 16147.0], [1331.0, 16428.0], [1339.0, 9966.0], [1343.0, 16187.0], [1335.0, 16163.0], [1295.0, 16508.0], [1291.0, 18046.0], [1287.0, 16965.0], [1283.0, 16964.0], [1311.0, 16342.0], [1307.0, 16674.0], [1303.0, 16790.0], [1299.0, 17705.0], [1327.0, 17745.0], [1323.0, 17434.0], [1319.0, 16076.0], [1315.0, 16140.0], [1407.0, 14800.0], [1383.0, 3622.6], [1363.0, 15175.0], [1367.0, 17123.0], [1387.0, 9379.0], [1379.0, 14971.0], [1403.0, 15199.0], [1399.0, 15815.0], [1395.0, 15624.0], [1375.0, 15969.0], [1347.0, 16178.0], [1351.0, 15256.0], [1355.0, 16188.0], [1359.0, 15665.0], [1371.0, 15589.0], [1463.0, 16182.0], [1459.0, 16283.0], [1471.0, 15995.0], [1443.0, 15086.0], [1447.0, 15276.0], [1451.0, 14113.0], [1467.0, 15046.0], [1423.0, 15238.0], [1419.0, 15551.0], [1415.0, 15154.0], [1411.0, 16859.0], [1439.0, 15310.5], [1435.0, 16382.0], [1431.0, 15455.0], [1427.0, 15519.0], [1455.0, 15227.0], [1523.0, 12952.0], [1503.0, 9330.5], [1499.0, 15882.0], [1495.0, 13776.0], [1491.0, 13777.0], [1535.0, 13902.0], [1507.0, 11901.0], [1511.0, 15584.0], [1515.0, 16071.0], [1531.0, 13655.0], [1487.0, 14967.0], [1483.0, 14922.0], [1479.0, 14941.0], [1475.0, 15973.0], [1519.0, 14835.0], [1567.0, 12635.0], [1563.0, 8535.5], [1559.0, 13750.0], [1555.0, 13500.0], [1539.0, 14757.0], [1543.0, 13488.0], [1547.0, 13870.0], [1551.0, 13333.0], [1587.0, 12781.0], [1575.0, 7114.666666666666], [1571.0, 12979.0], [1579.0, 9323.5], [1583.0, 13470.0], [1599.0, 8159.0], [1595.0, 12645.0], [1591.0, 12571.0], [1607.0, 12818.0], [1603.0, 14032.0], [1611.0, 12446.0], [1631.0, 13055.0], [1627.0, 13061.0], [1623.0, 13090.0], [1619.0, 13162.0], [1643.0, 11844.0], [1647.0, 12868.0], [1663.0, 12736.0], [1635.0, 12970.0], [1639.0, 13991.0], [1659.0, 12846.0], [1655.0, 13880.0], [1651.0, 12399.0], [1615.0, 14517.0], [1695.0, 11736.0], [1719.0, 11299.0], [1683.0, 7472.0], [1687.0, 12410.0], [1691.0, 11981.0], [1667.0, 12821.0], [1671.0, 12750.0], [1675.0, 12650.0], [1699.0, 5809.5], [1703.0, 13831.0], [1707.0, 11328.0], [1711.0, 12304.0], [1715.0, 12362.0], [1679.0, 11518.0], [1723.0, 7354.5], [1727.0, 4199.0], [1779.0, 12869.0], [1759.0, 11527.0], [1731.0, 12213.0], [1783.0, 7625.5], [1743.0, 13039.0], [1739.0, 13157.0], [1735.0, 12151.0], [1787.0, 7960.5], [1767.0, 8361.0], [1791.0, 11358.0], [1763.0, 11737.0], [1771.0, 11758.0], [1775.0, 11813.0], [1747.0, 11960.0], [1751.0, 6764.0], [1755.0, 7827.0], [1803.0, 11494.0], [1795.0, 8622.0], [1847.0, 7769.5], [1843.0, 10438.0], [1807.0, 12176.0], [1799.0, 10851.0], [1819.0, 7928.0], [1815.0, 10424.0], [1811.0, 11370.0], [1823.0, 7455.0], [1831.0, 7790.0], [1835.0, 7860.5], [1839.0, 10884.0], [1855.0, 10896.0], [1827.0, 10538.0], [1851.0, 10636.0], [1867.0, 6959.0], [1911.0, 11658.0], [1863.0, 12329.0], [1859.0, 11945.0], [1871.0, 11691.0], [1907.0, 10462.0], [1915.0, 7095.5], [1883.0, 10589.0], [1879.0, 10657.0], [1875.0, 12101.0], [1887.0, 10403.5], [1891.0, 11255.0], [1895.0, 11638.0], [1899.0, 9691.0], [1903.0, 10392.0], [1919.0, 9429.0], [1951.0, 9998.0], [1939.0, 10059.0], [1943.0, 11762.0], [1947.0, 9762.0], [1923.0, 9888.0], [1927.0, 6081.666666666667], [1931.0, 6453.0], [1935.0, 6254.333333333333], [1975.0, 7280.5], [1979.0, 8992.0], [1983.0, 8631.0], [1955.0, 9612.0], [1959.0, 9366.0], [1963.0, 9688.0], [1967.0, 9933.0], [1971.0, 9821.0], [2043.0, 9060.0], [1999.0, 6860.0], [1987.0, 9668.0], [1991.0, 9543.0], [1995.0, 9079.0], [2047.0, 7483.5], [2039.0, 8171.5], [2035.0, 6811.333333333334], [2019.0, 7168.5], [2023.0, 9319.0], [2027.0, 6597.0], [2031.0, 10326.0], [2003.0, 10482.0], [2007.0, 10542.0], [2011.0, 6008.333333333333], [2015.0, 9109.0], [2062.0, 6586.5], [2054.0, 6410.0], [2102.0, 8255.5], [2110.0, 9949.0], [2094.0, 6268.666666666667], [2086.0, 9706.0], [2078.0, 9007.0], [2150.0, 9639.0], [2158.0, 9820.0], [2174.0, 6975.5], [2166.0, 9643.0], [2118.0, 9284.0], [2126.0, 8987.0], [2134.0, 9625.0], [2142.0, 9891.0], [2070.0, 4355.0], [2190.0, 6836.0], [2182.0, 7411.0], [2238.0, 8849.0], [2222.0, 9026.0], [2230.0, 7301.5], [2214.0, 8376.0], [2198.0, 9060.0], [2286.0, 8485.0], [2294.0, 8144.0], [2278.0, 7962.0], [2262.0, 9894.0], [2270.0, 6830.5], [2246.0, 8451.0], [2254.0, 8462.0], [2302.0, 8563.0], [2422.0, 6832.0], [2430.0, 7278.0], [2374.0, 7261.0], [2382.0, 7038.0], [2390.0, 7407.0], [2398.0, 8765.0], [2414.0, 6976.0], [2406.0, 8524.0], [2366.0, 7770.0], [2310.0, 7705.0], [2318.0, 7682.0], [2326.0, 7830.0], [2334.0, 7700.0], [2358.0, 7518.0], [2350.0, 7553.0], [2342.0, 9386.0], [2550.0, 5785.0], [2558.0, 5861.0], [2502.0, 6340.0], [2510.0, 5915.0], [2518.0, 5962.0], [2526.0, 6218.0], [2542.0, 5582.0], [2534.0, 5860.0], [2494.0, 6338.0], [2438.0, 6867.0], [2446.0, 7568.0], [2454.0, 8178.0], [2462.0, 6577.0], [2486.0, 6363.0], [2478.0, 6201.0], [2470.0, 6912.0], [2574.0, 6160.5], [2566.0, 6126.0], [2582.0, 6028.5], [2590.0, 6411.0], [2063.0, 10624.0], [2055.0, 11134.0], [2111.0, 7020.5], [2103.0, 7331.0], [2095.0, 7546.5], [2087.0, 5277.25], [2071.0, 9194.0], [2079.0, 11144.0], [2151.0, 9625.0], [2159.0, 9834.0], [2167.0, 6955.5], [2175.0, 8774.0], [2119.0, 7389.5], [2143.0, 9910.0], [2135.0, 9948.0], [2127.0, 9952.0], [2199.0, 8955.0], [2183.0, 7957.0], [2239.0, 6009.0], [2231.0, 6679.5], [2215.0, 7565.5], [2223.0, 10157.0], [2207.0, 9092.0], [2247.0, 8930.0], [2303.0, 8351.0], [2295.0, 7846.0], [2279.0, 7475.0], [2287.0, 8668.0], [2255.0, 7269.0], [2263.0, 8624.0], [2271.0, 8551.0], [2191.0, 7079.5], [2423.0, 6713.0], [2431.0, 7157.0], [2375.0, 7763.0], [2383.0, 7138.0], [2391.0, 8111.0], [2399.0, 7395.0], [2415.0, 7375.0], [2407.0, 7375.0], [2367.0, 7069.0], [2311.0, 8274.0], [2319.0, 9315.0], [2327.0, 8029.0], [2335.0, 9287.0], [2359.0, 8075.0], [2351.0, 7827.0], [2343.0, 9176.0], [2551.0, 5819.0], [2559.0, 6889.0], [2503.0, 6726.0], [2511.0, 6003.0], [2519.0, 7072.0], [2527.0, 7015.0], [2543.0, 5646.0], [2535.0, 5862.0], [2495.0, 6811.0], [2439.0, 6490.0], [2455.0, 8052.0], [2463.0, 6904.0], [2487.0, 5896.0], [2479.0, 6097.0], [2471.0, 7150.0], [2575.0, 5517.333333333333], [2567.0, 6223.4], [2583.0, 6093.25], [1.0, 25118.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[1383.5266666666696, 14705.370666666675]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 2590.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 1665.0833333333333, "minX": 1.54958328E12, "maxY": 19143.716666666667, "series": [{"data": [[1.54958328E12, 19143.716666666667], [1.54958334E12, 1854.9833333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.54958328E12, 17184.916666666668], [1.54958334E12, 1665.0833333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 13702.438025594143, "minX": 1.54958328E12, "maxY": 25056.392452830187, "series": [{"data": [[1.54958328E12, 13702.438025594143], [1.54958334E12, 25056.392452830187]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 13702.428884826315, "minX": 1.54958328E12, "maxY": 25056.388679245294, "series": [{"data": [[1.54958328E12, 13702.428884826315], [1.54958334E12, 25056.388679245294]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 76.80365630712996, "minX": 1.54958328E12, "maxY": 769.7358490566039, "series": [{"data": [[1.54958328E12, 76.80365630712996], [1.54958334E12, 769.7358490566039]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 1098.0, "minX": 1.54958328E12, "maxY": 25962.0, "series": [{"data": [[1.54958328E12, 25321.0], [1.54958334E12, 25962.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.54958328E12, 1098.0], [1.54958334E12, 24182.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.54958328E12, 22570.2], [1.54958334E12, 24454.600000000002]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.54958328E12, 24617.559999999998], [1.54958334E12, 25367.839999999997]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.54958328E12, 23520.4], [1.54958334E12, 25040.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 13061.0, "minX": 4.0, "maxY": 25050.0, "series": [{"data": [[4.0, 25050.0], [45.0, 13061.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 45.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 13061.0, "minX": 4.0, "maxY": 25050.0, "series": [{"data": [[4.0, 25050.0], [45.0, 13061.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 45.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 50.0, "minX": 1.54958328E12, "maxY": 50.0, "series": [{"data": [[1.54958328E12, 50.0]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958328E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 4.416666666666667, "minX": 1.54958328E12, "maxY": 45.583333333333336, "series": [{"data": [[1.54958328E12, 45.583333333333336], [1.54958334E12, 4.416666666666667]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.54958334E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 4.416666666666667, "minX": 1.54958328E12, "maxY": 45.583333333333336, "series": [{"data": [[1.54958328E12, 45.583333333333336], [1.54958334E12, 4.416666666666667]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.54958334E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
